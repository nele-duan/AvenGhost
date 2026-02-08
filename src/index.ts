import { Telegraf } from 'telegraf';
import { Agent } from './core/agent';
import { LLM } from './core/llm';
import { MemorySystem } from './core/memory';
import { HeartbeatSystem } from './core/heartbeat';
import { VoiceSystem } from './core/voice';
import express from 'express';
import { setupHealthAPI } from './core/health';
// Old skills deleted (SystemSkill, FileSkill, SearchSkill)
// import { SystemSkill } from './skills/system'; 
import { CHARACTER_PROMPT } from './character'; // Import character
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';

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

  // 3a. Migrate chat history to RAG if needed (first-time setup)
  try {
    await memory.migrateHistoryToRAG();
  } catch (e) {
    console.error('[Startup] Migration failed:', e);
  }

  // 3b. Setup HTTP Server for Health Data API
  const httpApp = express();
  httpApp.use(express.json());
  setupHealthAPI(httpApp);
  const HEALTH_PORT = process.env.HEALTH_API_PORT || 3000;
  httpApp.listen(HEALTH_PORT, () => {
    console.log(`[Health API] Listening on port ${HEALTH_PORT}`);
  });

  // 3. Setup Telegram Bot
  const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: Infinity });

  // Middleware to log incoming
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`Response time: ${ms}ms`);
  });


  // Track active user to map phone numbers to IDs
  // In a real bot, we would database this. For now, we assume active session or ENV.
  let latestActiveUserId = '';

  // Track last bot message time for reply gap calculation
  let lastBotMessageTime: Date | null = null;

  // 5. Real-time Voice System (WebSocket-based for low latency)
  const { RealtimeVoiceSystem } = require('./core/realtime-voice');
  const voiceSystem = new RealtimeVoiceSystem();

  // TTS System for voice messages (reuse VoiceSystem's ElevenLabs integration)
  const ttsSystem = new VoiceSystem();

  // Register Voice Loop - now with real-time streaming
  voiceSystem.registerSpeechHandler(async (text: string, incomingPhoneNumber: string) => {
    let replyText = "";

    // Determine User ID
    let userId = "VOICE_USER";
    if (incomingPhoneNumber === process.env.USER_PHONE_NUMBER && latestActiveUserId) {
      userId = latestActiveUserId;
    } else if (latestActiveUserId) {
      userId = latestActiveUserId;
    }

    console.log(`[Index] Voice Input: "${text}" -> UserID: ${userId}`);

    // Capture reply
    const captureReply = async (text: string) => {
      replyText += text + " ";
    };

    // Voice call mode with tools disabled
    const contextInput = `[SYSTEM: VOICE CALL MODE. Spoken Input: "${text}". DO NOT USE TOOLS. DO NOT OUTPUT CODE BLOCKS. KEEP REPLY SHORT.]`;

    await agent.processMessage(userId, contextInput, captureReply, undefined, undefined, undefined, undefined, true);

    // Strip HTML and code blocks for TTS
    replyText = replyText.replace(/<pre>[\s\S]*?<\/pre>/gi, '');
    replyText = replyText.replace(/<[^>]*>/g, '');
    replyText = replyText.replace(/```[\s\S]*?```/g, '');

    return replyText.trim();
  });

  // Handle Sticker
  bot.on('sticker', async (ctx) => {
    const userId = ctx.from.id.toString();
    latestActiveUserId = userId; // Update active user
    const fileId = ctx.message.sticker.file_id;
    const emoji = ctx.message.sticker.emoji || '❓';

    // Log for config (Silent)
    console.log(`[STICKER LOG] Emoji: ${emoji} | File ID: ${fileId}`);

    // Auto-save sticker to stickers.json
    const stickersPath = path.join(__dirname, '../data/stickers.json');
    try {
      let stickers: Record<string, string> = {};
      if (await fs.pathExists(stickersPath)) {
        stickers = await fs.readJson(stickersPath);
      }
      // Use emoji as key, only save if not already exists
      const stickerKey = emoji.replace(/[\s:]/g, ''); // Clean emoji for key
      if (!stickers[stickerKey]) {
        stickers[stickerKey] = fileId;
        await fs.writeJson(stickersPath, stickers, { spaces: 2 });
        console.log(`[STICKER] Saved new sticker: ${stickerKey} -> ${fileId}`);
      }
    } catch (e) {
      console.error('[STICKER] Error saving sticker:', e);
    }

    // Forward to Agent as text context
    const simulatedMessage = `[User sent Sticker: ${emoji}]`;

    ctx.sendChatAction('typing');
    try {
      // Telegram supported reaction emojis (CONFIRMED working list - conservative)
      // Source: https://core.telegram.org/bots/api#reactiontypeemoji
      const VALID_REACTIONS = ['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '🕊️', '🤡', '🥱', '🥴', '😍', '🐳', '❤️‍🔥', '🌭', '💯', '🤣', '⚡️', '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈', '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '😨', '🤝', '✍️', '🤗', '🫡', '🎅', '🎄', '☃️', '💅', '🤪', '🗿', '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂️', '🤷', '🤷‍♀️', '😡'];
      const reactCallback = async (emoji: string) => {
        if (!VALID_REACTIONS.includes(emoji)) {
          console.warn(`[Reaction] Invalid emoji: ${emoji}, skipping`);
          return;
        }
        try { await ctx.react(emoji as any); } catch (e) { console.error(`[Reaction] Failed: ${emoji}`, e); }
      };
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
    latestActiveUserId = userId; // Update active user
    let message = ctx.message.text;

    // Calculate reply gap if we have a previous bot message
    if (lastBotMessageTime) {
      const now = new Date();
      const gapMs = now.getTime() - lastBotMessageTime.getTime();
      const gapMinutes = Math.floor(gapMs / 60000);
      const gapHours = Math.floor(gapMinutes / 60);
      const gapDays = Math.floor(gapHours / 24);

      let gapDescription = '';
      if (gapDays > 0) {
        gapDescription = `${gapDays}天${gapHours % 24}小时后`;
      } else if (gapHours > 0) {
        gapDescription = `${gapHours}小时${gapMinutes % 60}分钟后`;
      } else if (gapMinutes > 0) {
        gapDescription = `${gapMinutes}分钟后`;
      } else {
        gapDescription = '秒回';
      }

      // Prepend timing context to message for agent awareness
      message = `[User replied ${gapDescription} (${gapMinutes} mins since your last message)]\n${message}`;
      console.log(`[TIMING] User replied after ${gapMinutes} minutes`);
    }

    // Show typing status while thinking
    ctx.sendChatAction('typing');

    try {
      // Telegram supported reaction emojis (CONFIRMED working list - conservative)
      // Source: https://core.telegram.org/bots/api#reactiontypeemoji
      const VALID_REACTIONS = ['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '🕊️', '🤡', '🥱', '🥴', '😍', '🐳', '❤️‍🔥', '🌭', '💯', '🤣', '⚡️', '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈', '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '😨', '🤝', '✍️', '🤗', '🫡', '🎅', '🎄', '☃️', '💅', '🤪', '🗿', '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂️', '🤷', '🤷‍♀️', '😡'];
      const reactCallback = async (emoji: string) => {
        if (!VALID_REACTIONS.includes(emoji)) {
          console.warn(`[Reaction] Invalid emoji: ${emoji}, skipping`);
          return;
        }
        try {
          await ctx.react(emoji as any);
        } catch (e) {
          console.error(`[Reaction] Failed: ${emoji}`, e);
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
          // Helper: simulate typing delay
          const simulateTyping = async (text: string) => {
            // ~50ms per character, max 5 seconds, min 500ms
            const typingTime = Math.min(5000, Math.max(500, text.length * 50));
            await ctx.sendChatAction('typing');
            await new Promise(resolve => setTimeout(resolve, typingTime));
          };

          // Helper: random thinking pause (10% chance)
          const maybeThinkingPause = async () => {
            if (Math.random() < 0.1) {
              await ctx.sendChatAction('typing');
              await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
            }
          };

          // Split long messages (>300 chars) into chunks
          const shouldSplit = replyText.length > 300 && !replyText.includes('<pre>');

          if (shouldSplit) {
            // Split by sentences or newlines
            const chunks = replyText
              .split(/(?<=[。！？\n])/g)
              .filter(s => s.trim())
              .reduce((acc: string[], sentence) => {
                const last = acc[acc.length - 1];
                if (last && last.length + sentence.length < 200) {
                  acc[acc.length - 1] = last + sentence;
                } else {
                  acc.push(sentence);
                }
                return acc;
              }, []);

            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i].trim();
              if (!chunk) continue;

              await maybeThinkingPause();
              await simulateTyping(chunk);

              try {
                await ctx.reply(chunk, { parse_mode: mode });
              } catch (e) {
                await ctx.reply(chunk);
              }
              lastBotMessageTime = new Date();

              // Small pause between chunks
              if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
              }
            }
          } else {
            // Single message
            await maybeThinkingPause();
            await simulateTyping(replyText);

            try {
              await ctx.reply(replyText, { parse_mode: mode });
              lastBotMessageTime = new Date();
            } catch (e) {
              console.log(`[Telegram] ${mode} failed, falling back to plain text:`, e);
              await ctx.reply(replyText);
              lastBotMessageTime = new Date();
            }
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

      // Voice message callback - sends TTS audio as Telegram voice message
      const voiceMessageCallback = async (text: string) => {
        try {
          await ctx.sendChatAction('record_voice');
          console.log(`[VoiceMsg] Generating voice for: "${text.substring(0, 30)}..."`);

          // Generate speech using ElevenLabs
          const fileName = await ttsSystem.generateSpeech(text);
          const audioPath = path.join(__dirname, '../data/audio', fileName);

          // Send as Telegram voice message
          await ctx.replyWithVoice({ source: audioPath });
          lastBotMessageTime = new Date();

          console.log(`[VoiceMsg] Sent voice message: ${fileName}`);
        } catch (e: any) {
          console.error('[VoiceMsg] Failed:', e.message);
          // Fallback to text
          await ctx.reply(`🎤 ${text}`);
        }
      };

      await agent.processMessage(userId, message, sendReply, reactCallback, imageCallback, stickerCallback, callCallback, false, voiceMessageCallback);
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
