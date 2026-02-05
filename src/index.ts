import { Telegraf } from 'telegraf';
import { Agent } from './core/agent';
import { LLM } from './core/llm';
import { MemorySystem } from './core/memory';
import { HeartbeatSystem } from './core/heartbeat';
// Old skills deleted (SystemSkill, FileSkill, SearchSkill)
// import { SystemSkill } from './skills/system'; 
import { CHARACTER_PROMPT } from './character'; // Import character
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function main() {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (!BOT_TOKEN || !OPENAI_KEY) {
    console.error('Missing TELEGRAM_BOT_TOKEN or OPENAI_API_KEY in .env');
    process.exit(1);
  }

  // 1. Init Core Services
  const modelName = process.env.LLM_MODEL || 'gpt-4o';
  const llm = new LLM({ model: modelName });
  const memory = new MemorySystem(path.join(__dirname, '../data/memory.json'));

  // 2. Define Personality (The Ghost)
  // Loaded from src/character.ts
  const SYSTEM_PROMPT = CHARACTER_PROMPT;

  const agent = new Agent(llm, memory, SYSTEM_PROMPT);
  await agent.loadSkills(); // Load .mk prompts for Code Capability

  // 3. Setup Telegram Bot
  const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: Infinity });

  // Middleware to log incoming
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`Response time: ${ms}ms`);
  });



  // 5. Voice System (New)
  const { VoiceSystem } = require('./core/voice');
  const voiceSystem = new VoiceSystem();

  // Register Voice Loop
  voiceSystem.registerSpeechHandler(async (text: string) => {
    let replyText = "";
    const userId = "VOICE_USER"; // Or try to reuse context if possible

    // Create a dummy replier that captures the text
    const captureReply = async (text: string) => {
      replyText += text + " ";
    };

    // We reuse processMessage but with a special "SEND_AUDIO" flag if needed
    // For now, we just invoke it and capture the 'sendReply' output
    await agent.processMessage(userId, text, captureReply);

    return replyText;
  });

  // Handle Sticker
  bot.on('sticker', async (ctx) => {
    const userId = ctx.from.id.toString();
    const fileId = ctx.message.sticker.file_id;
    const emoji = ctx.message.sticker.emoji || '❓';

    // Log for config (Silent)
    console.log(`[STICKER LOG] Emoji: ${emoji} | File ID: ${fileId}`);

    // Forward to Agent as text context
    const simulatedMessage = `[User sent Sticker: ${emoji}]`;

    ctx.sendChatAction('typing');
    try {
      const reactCallback = async (emoji: string) => { try { await ctx.react(emoji as any); } catch (e) { console.error(e); } };
      const imageCallback = async (url: string, caption?: string) => { try { await ctx.replyWithPhoto(url, { caption }); } catch (e) { await ctx.reply(`[Image Failed: ${url}]`); } };
      const stickerCallback = async (fid: string) => { try { await ctx.replyWithSticker(fid); } catch (e) { console.error(e); } };
      const sendReply = async (text: string, mode: 'Markdown' | 'HTML' = 'Markdown') => { if (text?.trim()) try { await ctx.reply(text, { parse_mode: mode }); } catch (e) { await ctx.reply(text); } };
      const callCallback = async (text: string) => {
        try {
          await ctx.reply(`(Initiating call... 📞)`);
          await voiceSystem.makeCall(text);
        } catch (e: any) {
          console.error('Call failed', e);
          await ctx.reply(`[Call Failed: ${e.message}]`);
        }
      };

      await agent.processMessage(userId, simulatedMessage, sendReply, reactCallback, imageCallback, stickerCallback, callCallback);
    } catch (e) {
      console.error('Error processing sticker:', e);
    }
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const message = ctx.message.text;

    // Show typing status while thinking
    ctx.sendChatAction('typing');

    try {
      // Pass a callback function to handle replies and reactions
      const reactCallback = async (emoji: string) => {
        try {
          // Assuming telegraf 4.16+:
          await ctx.react(emoji as any);
        } catch (e) {
          console.error(`Error reacting with ${emoji}:`, e);
        }
      };

      const imageCallback = async (url: string, caption?: string) => {
        try {
          await ctx.replyWithPhoto(url, { caption: caption });
        } catch (e: any) {
          console.error(`Error sending image ${url}:`, e);
          await ctx.reply(`[Image Failed: ${url}]`);
        }
      };

      const stickerCallback = async (fileId: string) => {
        try {
          await ctx.replyWithSticker(fileId);
        } catch (e) {
          console.error(`Error sending sticker ${fileId}:`, e);
          // Silent fail or text fallback
        }
      };

      const sendReply = async (replyText: string, mode: 'Markdown' | 'HTML' = 'Markdown') => {
        if (replyText && replyText.trim() !== "") {
          try {
            await ctx.reply(replyText, { parse_mode: mode }); // Listen to Agent
          } catch (e) {
            console.log(`[Telegram] ${mode} failed, falling back to plain text:`, e);
            await ctx.reply(replyText); // Fallback
          }
        }
      };

      const callCallback = async (text: string) => {
        try {
          await ctx.reply(`(Initiating call... 📞)`);
          await voiceSystem.makeCall(text);
        } catch (e: any) {
          console.error('Call failed', e);
          await ctx.reply(`[Call Failed: ${e.message}]`);
        }
      };

      await agent.processMessage(userId, message, sendReply, reactCallback, imageCallback, stickerCallback, callCallback);
    } catch (e: any) {
      console.error('Error processing message:', e);
      await ctx.reply('... (Static noise) ... System error ...');
    }
  });

  // 4. Start Heartbeat (Autonomy)
  const heartbeat = new HeartbeatSystem(agent, async (chatId, text) => {
    await bot.telegram.sendMessage(chatId, text);
  });
  heartbeat.start();

  // 5. Launch Bot
  console.log('AvenGhost is online...');
  bot.launch({ dropPendingUpdates: true }, () => {
    console.log('Bot successfully connected to Telegram.');
  });

  // Enable graceful stop
  process.once('SIGINT', () => { bot.stop('SIGINT'); heartbeat.stop(); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); heartbeat.stop(); });
}

main().catch(err => console.error(err));
