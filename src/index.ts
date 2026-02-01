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
  const memory = new MemorySystem(path.join(__dirname, '../data/memory.json'), llm);

  // 2. Define Personality (The Ghost)
  // Loaded from src/character.ts
  const SYSTEM_PROMPT = CHARACTER_PROMPT;

  const agent = new Agent(llm, memory, SYSTEM_PROMPT);
  await agent.loadSkills(); // Load .mk prompts for Code Capability

  // 3. Setup Telegram Bot
  const bot = new Telegraf(BOT_TOKEN);

  // Middleware to log incoming
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`Response time: ${ms}ms`);
  });

  // Handle Text
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
        } catch (e) {
          console.error(`Error sending image ${url}:`, e);
          await ctx.reply(`[Image Failed: ${url}]`);
        }
      };

      await agent.processMessage(userId, message, async (replyText) => {
        if (replyText && replyText.trim() !== "") {
          await ctx.reply(replyText, { parse_mode: 'Markdown' }); // Enable Markdown for links
        }
      }, reactCallback, imageCallback);
    } catch (e) {
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
  bot.launch(() => {
    console.log('Bot successfully connected to Telegram.');
  });

  // Enable graceful stop
  process.once('SIGINT', () => { bot.stop('SIGINT'); heartbeat.stop(); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); heartbeat.stop(); });
}

main().catch(err => console.error(err));
