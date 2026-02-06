import fs from 'fs';
import path from 'path';
import axios from 'axios';
import express from 'express';
import ngrok from '@ngrok/ngrok';
import { Twilio } from 'twilio';

// Constants
const AUDIO_DIR = path.join(__dirname, '../../data/audio');
const PORT = 3456; // Local port for serving audio

// Ensure audio directory exists
fs.mkdirSync(AUDIO_DIR, { recursive: true });

export class VoiceSystem {
  private twilioClient: Twilio | null = null;
  private app: express.Application;
  private server: any;
  private publicUrl: string | null = null;

  constructor() {
    // Initialize Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      this.twilioClient = new Twilio(accountSid, authToken);
    }

    // Initialize Express to serve audio files
    this.app = express();

    // DEBUG: Log all incoming requests
    this.app.use((req: any, res: any, next: any) => {
      console.log(`[VoiceSystem] Incoming Request: ${req.method} ${req.url}`);
      console.log(`[VoiceSystem] User-Agent: ${req.get('User-Agent')}`);
      next();
    });

    this.app.use('/audio', express.static(AUDIO_DIR));
  }

  /**
   * Start the local server and ngrok tunnel
   */
  async startServer() {
    if (!this.server) {
      this.server = this.app.listen(PORT, () => {
        console.log(`[VoiceSystem] Audio server listening on port ${PORT}`);
      });
    }

    if (!this.publicUrl) {
      try {
        const authtoken = process.env.NGROK_AUTH_TOKEN;
        if (!authtoken) {
          console.warn('[VoiceSystem] WARNING: No NGROK_AUTH_TOKEN. This will likely fail.');
        }

        // Use official @ngrok/ngrok listener
        const listener = await ngrok.forward({
          addr: PORT,
          authtoken: authtoken,
          proto: 'http'
        });

        this.publicUrl = listener.url();
        console.log(`[VoiceSystem] Ngrok tunnel established: ${this.publicUrl}`);
      } catch (err) {
        console.error('[VoiceSystem] Failed to connect ngrok:', err);
      }
    }
    return this.publicUrl;
  }

  /**
   * Generate speech from text using ElevenLabs
   */
  async generateSpeech(text: string): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      throw new Error('Missing ElevenLabs configuration');
    }

    console.log(`[VoiceSystem] Generating speech for: "${text.substring(0, 20)}..."`);

    try {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
      const response = await axios({
        method: 'POST',
        url: url,
        data: {
          text: text,
          model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'stream'
      });

      const fileName = `speech_${Date.now()}.mp3`;
      const filePath = path.join(AUDIO_DIR, fileName);
      const writer = fs.createWriteStream(filePath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(fileName));
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('[VoiceSystem] TTS Generation failed:', error);
      throw error;
    }
  }

  /**
   * Initiate a phone call to the user
   */
  async makeCall(message: string): Promise<string> {
    if (!this.twilioClient) throw new Error('Twilio client not initialized');

    const to = process.env.USER_PHONE_NUMBER;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!to || !from) throw new Error('Missing phone numbers in configuration');

    // 1. Ensure server is running
    await this.startServer();

    // 2. Generate Audio
    const fileName = await this.generateSpeech(message);

    // 3. Construct Public URL
    if (!this.publicUrl) {
      throw new Error('Ngrok tunnel not established. Cannot serve audio.');
    }
    const audioUrl = `${this.publicUrl}/audio/${fileName}`;
    console.log(`[VoiceSystem] Audio URL prepared: ${audioUrl}`);

    // 4. Make the call
    try {
      const call = await this.twilioClient.calls.create({
        twiml: `
          <Response>
            <Play>${audioUrl}</Play>
            <Record action="${this.publicUrl}/audio/input" maxLength="60" playBeep="false" trim="trim-silence" timeout="2" />
            <Say language="zh-CN">I did not hear anything. Goodbye.</Say>
          </Response>
        `,
        to: to,
        from: from
      });
      return call.sid;
    } catch (error) {
      console.error('[VoiceSystem] Twilio call failed:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper
   */
  async transcribeAudio(audioUrl: string): Promise<string> {
    console.log(`[VoiceSystem] Transcribing: ${audioUrl}`);
    const OpenAI = require('openai');

    // Support separate STT provider (e.g. Groq) or fallback to main LLM provider
    const apiKey = process.env.STT_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.STT_BASE_URL || process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      console.error('[VoiceSystem] No API Key found for Transcription (STT_API_KEY or OPENAI_API_KEY)');
      return "";
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL // Respect custom endpoint (OpenRouter/Groq)
    });

    const fs = require('fs-extra');

    // 1. Download the MP3/WAV from Twilio
    // Twilio recordings are usually WAV.
    const tempFile = path.join(AUDIO_DIR, `input_${Date.now()}.wav`);

    try {
      const response = await axios({
        url: audioUrl.endsWith('.wav') ? audioUrl : `${audioUrl}.wav`, // Force .wav for better quality
        method: 'GET',
        responseType: 'stream',
        // Fix 401: Twilio recordings require Basic Auth by default
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID || '',
          password: process.env.TWILIO_AUTH_TOKEN || ''
        }
      });

      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const stats = await fs.stat(tempFile);
      console.log(`[VoiceSystem] Downloaded file size: ${stats.size} bytes`);

      // 2. Send to Whisper
      const isGroq = baseURL?.includes('groq.com');
      // whisper-large-v3-turbo: faster + better noise robustness, good for phone audio
      // Fallback to whisper-1 for OpenAI
      const modelName = process.env.STT_MODEL || (isGroq ? 'whisper-large-v3-turbo' : 'whisper-1');

      console.log(`[VoiceSystem] Using Model: ${modelName} (BaseURL: ${baseURL})`);

      // Early exit: Only skip truly corrupt/empty files.
      // WAV header alone is ~44 bytes. Even a short "喂" is still several KB.
      // Only skip if it's basically empty/corrupt (< 1KB).
      if (stats.size < 1000) {
        console.warn(`[VoiceSystem] Audio file corrupt/empty (${stats.size} bytes). Skipping.`);
        await fs.remove(tempFile);
        return "";
      }

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: modelName,
        language: "zh", // Hint Chinese
        // IMPORTANT: Use vocabulary hints, NOT sentences that could be regurgitated as speech.
        // Whisper hallucinates prompt text when audio is silent/garbage.
        prompt: "Aven, 聊天, 对话, 语音助手",
        temperature: 0.0 // Minimize creativity/hallucination
      });

      let text = transcription.text.trim();

      // Hallucination Filter: Whisper has SEVERE hallucination issues with Chinese
      // on low-quality phone audio (8kHz). These are phrases from its training data.
      const HALLUCINATIONS = [
        // Most common Chinese hallucinations (YouTube/Bilibili subtitle artifacts)
        "谢谢大家",
        "谢谢观看",
        "感谢大家",
        "感谢观看",
        "感谢收听",
        "请订阅",
        "请点赞",
        "请不吝点赞",
        "欢迎订阅",
        "字幕",
        "字幕组",
        "字幕由",
        "字幕制作",
        "视频来源",
        "视频来自",
        "本视频",
        "下期再见",
        "下次再见",
        "我们下期",
        "拜拜",
        "再见",
        // English hallucinations
        "Thank you",
        "Thanks for watching",
        "Thanks for listening",
        "Please subscribe",
        "The end",
        "Goodbye",
        "See you next time",
        // Legal/copyright disclaimers
        "仅供学习",
        "请于24小时内删除",
        "48小时内删除",
        "版权归原作者",
        "侵权请联系",
        "For study",
        "research purpose",
        // Old prompt fragments
        "请准确识别用户的语音",
        "用户正在和AI助手聊天",
        "这是一段中文对话",
        // Random nonsense Whisper generates
        "...",
        "。。。",
        "…"
      ];

      for (const phrase of HALLUCINATIONS) {
        if (text.toLowerCase().includes(phrase.toLowerCase())) {
          console.warn(`[VoiceSystem] Filtered Hallucination: "${text}" matches "${phrase}"`);
          await fs.remove(tempFile);
          return "";
        }
      }

      // Suspicious short output: Large file but tiny result
      // This often indicates Whisper failed to understand and guessed something short
      if (stats.size > 10000 && text.length < 6) {
        console.warn(`[VoiceSystem] Suspicious: ${stats.size} bytes audio -> only ${text.length} chars "${text}"`);
        // Don't filter, just log - user might have said something short
      }

      console.log(`[VoiceSystem] Whisper Final Result: "${text}" (${text.length} chars from ${stats.size} bytes)`);

      // Cleanup
      await fs.remove(tempFile);

      return text;
    } catch (e: any) {
      console.error('[VoiceSystem] Transcription failed:', e);
      return "";
    }
  }

  /**
   * Register a callback to handle speech input from the user.
   */
  public registerSpeechHandler(handler: (text: string, incomingPhoneNumber: string) => Promise<string>) {
    const bodyParser = require('body-parser');
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.app.post('/audio/input', async (req: any, res: any) => {
      console.log('[VoiceSystem] Received Interaction:', req.body);

      const recordingUrl = req.body.RecordingUrl;
      const incomingPhoneNumber = req.body.From;

      if (!recordingUrl) {
        // Fallback if no recording (e.g. hung up)
        res.send('<Response></Response>');
        return;
      }

      console.log(`[VoiceSystem] Processing recording: ${recordingUrl} (Duration: ${req.body.RecordingDuration}s)`);

      try {
        // Transcribe
        const userSpeech = await this.transcribeAudio(recordingUrl);

        if (!userSpeech || userSpeech.trim().length === 0) {
          // Silence? Loop back.
          res.set('Content-Type', 'text/xml');
          res.send(`<Response><Record action="${this.publicUrl}/audio/input" maxLength="60" playBeep="false" trim="trim-silence" timeout="2" /></Response>`);
          return;
        }

        // Pass to Agent to get response
        const agentStart = Date.now();
        const agentReply = await handler(userSpeech, incomingPhoneNumber);
        console.log(`[VoiceSystem] Agent Response Time: ${Date.now() - agentStart}ms`);

        // Generate Audio for reply
        const ttsStart = Date.now();
        const fileName = await this.generateSpeech(agentReply);
        console.log(`[VoiceSystem] TTS Generation Time: ${Date.now() - ttsStart}ms`);

        const audioUrl = `${this.publicUrl}/audio/${fileName}`;

        // Return TwiML to play reply AND Record again (Loop)
        const twiml = `
            <Response>
              <Play>${audioUrl}</Play>
              <Record action="${this.publicUrl}/audio/input" maxLength="60" playBeep="false" trim="trim-silence" timeout="2" />
            </Response>
          `;

        res.set('Content-Type', 'text/xml');
        res.send(twiml);
      } catch (error) {
        console.error('[VoiceSystem] Error in speech handler:', error);
        res.set('Content-Type', 'text/xml');
        // Fallback: Just loop back or say error (Saying error is safer)
        res.send(`<Response><Say>System error. Goodbye.</Say></Response>`);
      }
    });
  }
}
