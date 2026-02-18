/**
 * Real-time Voice System
 * 
 * Uses WebSocket-based streaming for low-latency voice interaction:
 * - Twilio Media Streams: Bidirectional audio streaming
 * - Deepgram: Real-time STT
 * - ElevenLabs: Streaming TTS
 */

import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import ngrok from '@ngrok/ngrok';
import { Twilio } from 'twilio';

const PORT = 3456;

interface TwilioMediaMessage {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  streamSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    customParameters?: Record<string, string>;
  };
  media?: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string; // Base64 encoded mulaw audio
  };
  mark?: {
    name: string;
  };
}

interface CallSession {
  streamSid: string;
  callSid: string;
  deepgramWs: WebSocket | null;
  elevenLabsWs: WebSocket | null;
  isPlaying: boolean;
  pendingText: string;
  twilioWs: WebSocket;
  initialGreeting?: string;  // Initial greeting to play when stream starts
  // Barge-in support
  isSpeaking: boolean;       // Agent is currently sending TTS audio chunks
  interrupted: boolean;      // Was the last TTS interrupted by user?
  spokenText: string;        // Full text being spoken by TTS
  bytesSent: number;         // Audio bytes sent before interrupt
  totalBytes: number;        // Total audio bytes for current TTS
  lastInterruptContext: string; // Context about what user heard before interrupt
}

export class RealtimeVoiceSystem {
  private twilioClient: Twilio | null = null;
  private app: express.Application;
  private wss: WebSocketServer | null = null;
  private server: any;
  private publicUrl: string | null = null;
  private sessions: Map<string, CallSession> = new Map();
  private speechHandler: ((text: string, phone: string) => Promise<string>) | null = null;

  constructor() {
    // Initialize Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      this.twilioClient = new Twilio(accountSid, authToken);
    }

    this.app = express();
    this.app.use(express.urlencoded({ extended: true }));

    // Debug logging
    this.app.use((req: any, res: any, next: any) => {
      console.log(`[RealtimeVoice] ${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * Start the server with WebSocket support
   */
  async startServer(): Promise<string | null> {
    if (!this.server) {
      this.server = this.app.listen(PORT, () => {
        console.log(`[RealtimeVoice] Server listening on port ${PORT}`);
      });

      // Create WebSocket server
      this.wss = new WebSocketServer({ server: this.server });
      this.setupWebSocketHandlers();
    }

    // Setup ngrok tunnel
    if (!this.publicUrl) {
      try {
        const authtoken = process.env.NGROK_AUTH_TOKEN;
        if (!authtoken) {
          console.warn('[RealtimeVoice] WARNING: No NGROK_AUTH_TOKEN');
        }

        const listener = await ngrok.forward({
          addr: PORT,
          authtoken: authtoken,
          proto: 'http'
        });

        this.publicUrl = listener.url();
        console.log(`[RealtimeVoice] Ngrok tunnel: ${this.publicUrl}`);
      } catch (err) {
        console.error('[RealtimeVoice] Ngrok failed:', err);
      }
    }

    return this.publicUrl;
  }

  /**
   * Setup WebSocket handlers for Twilio Media Streams
   */
  private setupWebSocketHandlers() {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('[RealtimeVoice] New WebSocket connection');

      let session: CallSession | null = null;

      ws.on('message', async (data: Buffer) => {
        try {
          const msg: TwilioMediaMessage = JSON.parse(data.toString());

          switch (msg.event) {
            case 'connected':
              console.log('[RealtimeVoice] Twilio connected');
              break;

            case 'start':
              console.log('[RealtimeVoice] Stream started:', msg.start?.streamSid);
              session = {
                streamSid: msg.start!.streamSid,
                callSid: msg.start!.callSid,
                deepgramWs: null,
                elevenLabsWs: null,
                isPlaying: false,
                pendingText: '',
                twilioWs: ws,
                initialGreeting: msg.start?.customParameters?.greeting,
                // Barge-in state
                isSpeaking: false,
                interrupted: false,
                spokenText: '',
                bytesSent: 0,
                totalBytes: 0,
                lastInterruptContext: ''
              };
              this.sessions.set(msg.start!.streamSid, session);

              // Connect to Deepgram for real-time STT
              await this.connectDeepgram(session);

              // Play initial greeting using ElevenLabs TTS (not Twilio's default voice)
              if (session.initialGreeting) {
                await this.streamTTS(session, session.initialGreeting);
              }
              break;

            case 'media':
              if (session && msg.media?.payload) {
                // Forward audio to Deepgram for STT + VAD
                // Barge-in detection is now handled by Deepgram's SpeechStarted event
                this.forwardToDeepgram(session, msg.media.payload);
              }
              break;

            case 'mark':
              console.log('[RealtimeVoice] Mark received:', msg.mark?.name);
              if (session && msg.mark?.name === 'playback-end') {
                session.isPlaying = false;
              }
              break;

            case 'stop':
              console.log('[RealtimeVoice] Stream stopped');
              if (session) {
                this.cleanupSession(session);
                this.sessions.delete(session.streamSid);
              }
              break;
          }
        } catch (e) {
          console.error('[RealtimeVoice] Error processing message:', e);
        }
      });

      ws.on('close', () => {
        console.log('[RealtimeVoice] WebSocket closed');
        if (session) {
          this.cleanupSession(session);
          this.sessions.delete(session.streamSid);
        }
      });

      ws.on('error', (err: Error) => {
        console.error('[RealtimeVoice] WebSocket error:', err);
      });
    });
  }

  /**
   * Connect to Deepgram for real-time STT
   */
  private async connectDeepgram(session: CallSession) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error('[RealtimeVoice] No DEEPGRAM_API_KEY');
      return;
    }

    // Track accumulated transcript for this utterance
    let accumulatedTranscript = '';

    const url = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
      model: 'nova-2',
      language: 'zh-CN',
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      punctuate: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',  // Increased from 1000 to 1500 for more natural pauses
      vad_events: 'true',
      endpointing: '500'  // Minimum silence before considering speech ended
    }).toString();

    session.deepgramWs = new WebSocket(url, {
      headers: { 'Authorization': `Token ${apiKey}` }
    });

    session.deepgramWs.on('open', () => {
      console.log('[RealtimeVoice] Deepgram connected');
    });

    session.deepgramWs.on('message', async (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());

        // Barge-in: Deepgram detects user started speaking while agent is talking
        if (response.type === 'SpeechStarted') {
          if (session.isSpeaking) {
            console.log('[Barge-in] User started speaking! Stopping playback.');
            session.interrupted = true;

            // Calculate what the user actually heard
            const heardRatio = session.totalBytes > 0
              ? session.bytesSent / session.totalBytes
              : 0;
            const heardText = session.spokenText.substring(
              0, Math.floor(session.spokenText.length * heardRatio)
            );
            session.lastInterruptContext = heardText;
            console.log(`[Barge-in] User heard ~${Math.round(heardRatio * 100)}%: "${heardText.substring(0, 50)}..."`);

            this.stopPlayback(session);
          }
          return;
        }

        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          const isFinal = response.is_final;

          if (transcript && isFinal) {
            // Accumulate final transcripts instead of processing immediately
            accumulatedTranscript += transcript;
            console.log(`[RealtimeVoice] Final: "${transcript}" (Accumulated: "${accumulatedTranscript}")`);
          } else if (transcript) {
            console.log(`[RealtimeVoice] Interim: "${transcript}"`);
          }
        } else if (response.type === 'UtteranceEnd') {
          // Only process when user has finished speaking
          console.log(`[RealtimeVoice] Utterance end - Processing: "${accumulatedTranscript}"`);

          if (accumulatedTranscript.trim() && this.speechHandler) {
            let textToProcess = accumulatedTranscript.trim();
            accumulatedTranscript = '';  // Reset for next utterance

            // If previous TTS was interrupted, prepend barge-in context
            if (session.lastInterruptContext) {
              const bargeInCtx = `[SYSTEM: Your previous speech was INTERRUPTED by the user. ` +
                `They only heard: "${session.lastInterruptContext}". ` +
                `They did NOT hear the rest. The user then said:]`;
              textToProcess = `${bargeInCtx}\n${textToProcess}`;
              session.lastInterruptContext = '';  // Reset after use
              console.log(`[Barge-in] Injected interrupt context into next message`);
            }

            const reply = await this.speechHandler(textToProcess, '');
            if (reply) {
              await this.streamTTS(session, reply);
            }
          } else {
            accumulatedTranscript = '';  // Reset even if empty
          }
        }
      } catch (e) {
        console.error('[RealtimeVoice] Deepgram parse error:', e);
      }
    });

    session.deepgramWs.on('close', () => {
      console.log('[RealtimeVoice] Deepgram disconnected');
    });

    session.deepgramWs.on('error', (err: Error) => {
      console.error('[RealtimeVoice] Deepgram error:', err);
    });
  }

  /**
   * Forward audio from Twilio to Deepgram
   */
  private forwardToDeepgram(session: CallSession, base64Audio: string) {
    if (session.deepgramWs?.readyState === WebSocket.OPEN) {
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      session.deepgramWs.send(audioBuffer);
    }
  }

  /**
   * Stream TTS audio back to Twilio using REST API
   */
  private async streamTTS(session: CallSession, text: string) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    const axios = require('axios');

    if (!apiKey || !voiceId) {
      console.error('[RealtimeVoice] Missing ElevenLabs config');
      return;
    }

    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    console.log(`[RealtimeVoice] TTS: "${text.substring(0, 30)}..." (Voice: ${voiceId}, Model: ${modelId})`);

    // Set barge-in tracking state
    session.isPlaying = true;
    session.isSpeaking = true;
    session.interrupted = false;
    session.spokenText = text;
    session.bytesSent = 0;
    session.totalBytes = 0;

    try {
      // Use REST API with streaming response
      // output_format must be in query string, not body
      const response = await axios({
        method: 'POST',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=ulaw_8000`,
        data: {
          text: text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        headers: {
          'Accept': 'audio/basic',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer'
      });

      // Work with raw audio buffer for accurate byte tracking
      const rawAudio = Buffer.from(response.data);
      session.totalBytes = rawAudio.length;

      // Send in chunks with real-time pacing (interruptible)
      // Each chunk = 160 bytes = 20ms of 8kHz mulaw audio
      const chunkSize = 160;
      for (let i = 0; i < rawAudio.length; i += chunkSize) {
        // Check for barge-in interrupt before sending each chunk
        if (session.interrupted) {
          console.log(`[Barge-in] TTS interrupted at byte ${session.bytesSent}/${session.totalBytes} (${Math.round(session.bytesSent / session.totalBytes * 100)}%)`);
          break;
        }

        const chunk = rawAudio.slice(i, i + chunkSize);
        this.sendAudioToTwilio(session, chunk.toString('base64'));
        session.bytesSent = i + chunk.length;

        // Real-time pacing: ~18ms delay per 20ms chunk
        // This allows barge-in detection between chunks
        await new Promise(r => setTimeout(r, 18));
      }

      if (!session.interrupted) {
        console.log('[RealtimeVoice] TTS complete (uninterrupted)');
      }

      session.isPlaying = false;
      session.isSpeaking = false;

    } catch (e: any) {
      console.error('[RealtimeVoice] TTS failed:', e.response?.data || e.message);
      session.isPlaying = false;
      session.isSpeaking = false;
    }
  }

  /**
   * Send audio chunk to Twilio
   */
  private sendAudioToTwilio(session: CallSession, base64Audio: string) {
    if (session.twilioWs.readyState === WebSocket.OPEN) {
      session.twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: session.streamSid,
        media: {
          payload: base64Audio
        }
      }));
    }
  }

  /**
   * Stop current playback (for barge-in)
   */
  private stopPlayback(session: CallSession) {
    session.isPlaying = false;

    // Close ElevenLabs connection
    if (session.elevenLabsWs) {
      session.elevenLabsWs.close();
      session.elevenLabsWs = null;
    }

    // Send clear message to Twilio
    session.twilioWs.send(JSON.stringify({
      event: 'clear',
      streamSid: session.streamSid
    }));
  }

  /**
   * Cleanup session resources
   */
  private cleanupSession(session: CallSession) {
    if (session.deepgramWs) {
      session.deepgramWs.close();
    }
    if (session.elevenLabsWs) {
      session.elevenLabsWs.close();
    }
  }

  /**
   * Register the speech handler callback
   */
  public registerSpeechHandler(handler: (text: string, phone: string) => Promise<string>) {
    this.speechHandler = handler;

    // Setup HTTP endpoint for initial call
    this.app.post('/voice/incoming', (req: any, res: any) => {
      const wsUrl = this.publicUrl?.replace('https://', 'wss://').replace('http://', 'ws://');

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say language="zh-CN">连接中，请稍候。</Say>
          <Connect>
            <Stream url="${wsUrl}/media-stream" />
          </Connect>
        </Response>`;

      res.set('Content-Type', 'text/xml');
      res.send(twiml);
    });
  }

  /**
   * Make an outbound call
   */
  async makeCall(text?: string): Promise<string | null> {
    if (!this.twilioClient) {
      console.error('[RealtimeVoice] Twilio not configured');
      return null;
    }

    await this.startServer();
    if (!this.publicUrl) {
      console.error('[RealtimeVoice] No public URL');
      return null;
    }

    const toNumber = process.env.USER_PHONE_NUMBER;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!toNumber || !fromNumber) {
      console.error('[RealtimeVoice] Missing phone numbers');
      return null;
    }

    const wsUrl = this.publicUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    // Pass initial greeting as custom parameter to the stream
    const greetingText = text || '你好，我是你的AI助手。';

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="${wsUrl}/media-stream">
            <Parameter name="greeting" value="${greetingText.replace(/"/g, '&quot;')}" />
          </Stream>
        </Connect>
      </Response>`;

    try {
      const call = await this.twilioClient.calls.create({
        to: toNumber,
        from: fromNumber,
        twiml: twiml
      });

      console.log(`[RealtimeVoice] Call initiated: ${call.sid}`);
      return call.sid;
    } catch (err) {
      console.error('[RealtimeVoice] Call failed:', err);
      return null;
    }
  }
}
