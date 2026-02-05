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
            <Record action="${this.publicUrl}/audio/input" maxLength="10" playBeep="false" trim="trim-silence" timeout="2" />
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
        url: audioUrl,
        method: 'GET',
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // 2. Send to Whisper
      // Note: OpenRouter might NOT support this endpoint.
      // If using OpenRouter for LLM, user should likely use Groq for STT.
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: "whisper-1", // Or 'whisper-large-v3' for Groq
        language: "zh" // Hint Chinese
      });

      console.log(`[VoiceSystem] Whisper Result: ${transcription.text}`);

      // Cleanup
      await fs.remove(tempFile);

      return transcription.text;
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

      console.log(`[VoiceSystem] Processing recording: ${recordingUrl}`);

      // Transcribe
      const userSpeech = await this.transcribeAudio(recordingUrl);

      if (!userSpeech || userSpeech.trim().length === 0) {
        // Silence? Loop back.
        res.set('Content-Type', 'text/xml');
        res.send(`<Response><Record action="${this.publicUrl}/audio/input" maxLength="10" playBeep="false" trim="trim-silence" timeout="2" /></Response>`);
        return;
      }

      // Pass to Agent to get response
      const agentReply = await handler(userSpeech, incomingPhoneNumber);

      // Generate Audio for reply
      const fileName = await this.generateSpeech(agentReply);
      const audioUrl = `${this.publicUrl}/audio/${fileName}`;

      // Return TwiML to play reply AND Record again (Loop)
      const twiml = `
        <Response>
          <Play>${audioUrl}</Play>
          <Record action="${this.publicUrl}/audio/input" maxLength="10" playBeep="false" trim="trim-silence" timeout="2" />
        </Response>
      `;

      res.set('Content-Type', 'text/xml');
      res.send(twiml);
    });
  }
}
