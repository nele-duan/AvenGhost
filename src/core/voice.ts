import fs from 'fs';
import path from 'path';
import axios from 'axios';
import express from 'express';
import ngrok from 'ngrok';
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
        if (authtoken) {
          await ngrok.connect({ addr: PORT, authtoken });
        } else {
          console.warn('[VoiceSystem] No NGROK_AUTH_TOKEN found. Calls may fail if not running locally with public IP.');
          await ngrok.connect({ addr: PORT });
        }
        this.publicUrl = await ngrok.getUrl();
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
    const audioUrl = `${this.publicUrl}/audio/${fileName}`;
    console.log(`[VoiceSystem] Audio URL prepared: ${audioUrl}`);

    // 4. Make the call
    try {
      const call = await this.twilioClient.calls.create({
        twiml: `<Response><Play>${audioUrl}</Play></Response>`,
        to: to,
        from: from
      });
      return call.sid;
    } catch (error) {
      console.error('[VoiceSystem] Twilio call failed:', error);
      throw error;
    }
  }
}
