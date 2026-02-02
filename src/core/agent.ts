import { LLM } from './llm';
import { IMemorySystem, MemorySystem } from './memory';
import { AgentContext } from './skill';
// import { CodeSkill } from '../skills/code'; // Dynamic import used inside

export class Agent {
  private llm: LLM;
  private memory: IMemorySystem;
  private defaultSystemPrompt: string; // Base prompt (Character + Soul)
  private skillPrompts: string = "";

  // Hardcoded engine
  private codeSkill = new (require('../skills/code').CodeSkill)();

  constructor(
    llm: LLM,
    memory: IMemorySystem,
    systemPrompt: string
  ) {
    this.llm = llm;
    this.memory = memory;
    this.defaultSystemPrompt = systemPrompt;
  }

  async loadSkills() {
    const fs = require('fs-extra');
    const path = require('path');

    // Fix: In production (dist), __dirname is 'dist/core'. 
    // .md files are in 'src/skills' and are NOT copied to dist by tsc.
    // So we must look in '../../src/skills'.
    let skillsDir = path.join(__dirname, '../../src/skills');

    // Fallback: If we are running in ts-node (dev), it might be different, or if files were copied.
    if (!await fs.pathExists(skillsDir)) {
      console.warn(`[Agent] Warning: Skills dir not found at ${skillsDir}. Trying '../skills'...`);
      skillsDir = path.join(__dirname, '../skills');
    }

    try {
      if (!await fs.pathExists(skillsDir)) {
        console.error(`[Agent] CRITICAL: Skills directory not found at ${skillsDir}. Skills will not be loaded.`);
        return;
      }

      const files = await fs.readdir(skillsDir);
      let loadedCount = 0;
      for (const file of files) {
        if (file.endsWith('.mk') || file.endsWith('.md')) {
          const content = await fs.readFile(path.join(skillsDir, file), 'utf-8');
          this.skillPrompts += `\n---\nSOURCE: ${file}\n${content}\n`;
          loadedCount++;
        }
      }
      console.log(`[Agent] Loaded ${loadedCount} skill prompts from ${skillsDir}`);
    } catch (e) {
      console.error('Error loading skills:', e);
    }
  }

  async processMessage(
    userId: string,
    message: string,
    sendReply: (text: string) => Promise<void>,
    sendReaction?: (emoji: string) => Promise<void>,
    sendImage?: (url: string, caption?: string) => Promise<void>
  ): Promise<void> {
    console.log(`[Agent] Processing message from ${userId}: ${message}`);
    const fs = require('fs-extra');
    const path = require('path');

    // 1. Dynamic Identity Loading
    let soulContent = "IDENTITY: Default Aven";
    let userContent = `USER: ${userId} (New User)`;

    try {
      // Load Soul (Global)
      const soulPath = path.join(__dirname, '../../data/soul.md');
      if (await fs.pathExists(soulPath)) {
        soulContent = await fs.readFile(soulPath, 'utf-8');
      }

      // Load User Profile (Specific)
      const userDir = path.join(__dirname, '../../data/users');
      await fs.ensureDir(userDir);

      const userPath = path.join(userDir, `${userId}.md`);
      const templatePath = path.join(userDir, 'template.md'); // If we have one

      if (await fs.pathExists(userPath)) {
        userContent = await fs.readFile(userPath, 'utf-8');
      } else {
        // New User! Output log and maybe create default?
        console.log(`[Agent] New user ${userId} detected. Creating profile...`);
        if (await fs.pathExists(templatePath)) {
          userContent = await fs.readFile(templatePath, 'utf-8');
        } else {
          userContent = `# USER PROFILE (${userId})\nFirst interaction: ${new Date().toISOString()}\n\n## NOTES\n(No data yet)`;
        }
        await fs.writeFile(userPath, userContent);
      }
    } catch (e) {
      console.error('[Agent] Error loading Dynamic Identity:', e);
    }

    // 2. Construct System Prompt
    // Combine Soul, User Profile, and Base Personality
    const dynamicSystemPrompt = `${this.defaultSystemPrompt}\n\n${soulContent}\n\n${userContent}`;

    // 3. Memory & Context
    // We pass null for LLM because MemorySystem is now passive (no auto-summary)
    // Actually Agent.ts doesn't init MemorySystem, index.ts does. 
    // We just need to update the prompt here.

    await this.memory.addMessage('user', message);
    let contextStr = await this.memory.getContext();

    // 4. Prompt Construction
    const systemInstruction = `${dynamicSystemPrompt}

KNOWN SKILLS / INSTRUCTIONS:
${this.skillPrompts}`;

    let userPayload = `CONTEXT HISTORY:
${contextStr}

CURRENT SYSTEM TIME: ${new Date().toLocaleString()} (Timezone: Server Local)

CURRENT USER MESSAGE:
${message}

CRITICAL INSTRUCTION:
1. DECIDE: Does the user want a task done?
2. YES: Output CODE BLOCK immediately.
3. NO: Chat naturally.

MEMORY MANAGEMENT (SELF-MANAGED):
- You have NO automatic memory. You must write things down yourself.
- **Active Notes**: Use 'echo "note" >> data/memories/diary.md' to keep specific notes. (Markdown is best!)
- **Deep Recall**: You can read 'cat data/chat_history.md' to see the full conversation history if you forgot something old.
- **You Decide**: You judge what is worth saving. The system will not help you.

HOST SYSTEM ACCESS (GOD MODE):
- You are in an Alpine container, but you have HOST root access.
- To run system commands (systemctl, timedatectl, apt, journalctl, etc.) that are missing in Alpine:
- MUST USE: 'nsenter -t 1 -m -u -i -n <command>'
- Example: 'nsenter -t 1 -m -u -i -n timedatectl status'
- DO NOT claim a command is missing until you try 'nsenter'.

4. REACTION: You MUST use the hidden tag [REACTION:emoji] to react.
   INVALID: "(I react with a heart)" or "*reacts*"
   LIMIT: MAX 1 reaction per message. DO NOT SPAM.
   Supported Emojis: 👍, 👎, ❤️, 🔥, 🥰, 👏, 😁, 🤔, 🤯, 😱, 🤬, 😢, 🎉, 🤩, 🤮, 💩, 🙏, 🕊️, 🤡, 🥱, 🥴, 😍, 🐳, 🤝, 👨‍💻, 👀, 🌚, ⚡️, 🍌, 🏆, 💔, 🤨, 😐, 🍓, 🍾, 💋, 🖕, 😈, 😴, 😭, 🤓, 👻, 👨‍🏫, 🤝, ✍️, 🥺, 🦜,  Saturn, etc.
   Use this liberally to show emotion! (But only one).
5. IMAGES: [IMAGE:url] (e.g. [IMAGE:https://...]).
   LINKS: [Title](url)
6. SILENCE IS GOLDEN: If you are executing a simple task (like checking a file), output the CODE BLOCK immediately. Do NOT write a preamble like "I will check...".
   - IF NO PREAMBLE: The user sees only the FINAL result (1 message).
   - IF PREAMBLE: The user sees "Thinking..." then "Result" (2 messages).
   - PREFER 1 MESSAGE for simple actions.
`;

    // --- ROUND 1 ---
    let response = await this.llm.chat(systemInstruction, userPayload);
    response = response ? response.trim() : "";

    // AGGRESSIVE Reaction Cleaning
    // Matches: [REACTION:x], REACTION:x, Reaction: x, with or without brackets
    const reactionRegex = /(?:\[\s*)?REACTION\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
    let matchReaction;
    let hasReacted = false; // Limit to 1 reaction per turn

    while ((matchReaction = reactionRegex.exec(response)) !== null) {
      const emoji = matchReaction[1].trim();
      if (sendReaction && !hasReacted) {
        await sendReaction(emoji);
        hasReacted = true;
      }
    }
    response = response.replace(reactionRegex, '').trim();

    // Image Cleaning
    const imageRegex = /(?:\[\s*)?IMAGE\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
    let matchImage;
    while ((matchImage = imageRegex.exec(response)) !== null) {
      const url = matchImage[1].trim();
      if (sendImage) await sendImage(url);
    }
    response = response.replace(imageRegex, '').trim();

    // Now handle code blocks...
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/;
    const match = codeBlockRegex.exec(response);

    if (match) {
      // Found Code!
      // 1. Capture the thought (text before code).
      const thought = response.substring(0, match.index).trim();
      const language = match[1] ? match[1].toLowerCase().trim() : 'bash';
      const code = match[2];

      // 2. SEND THE THOUGHT (Process) to the user, if it exists.
      // This satifies the user requirement: "Show process, but hide code"
      if (thought) {
        await sendReply(thought);
        await this.memory.addMessage('assistant', thought);

        // CRITICAL FIX: Update userPayload so Round 2 sees this message!
        // Actually, we will NOT reuse userPayload for Round 2 anymore. 
        // We will build a dedicated "Reflection Prompt" to avoid the "Fresh Input" bias.
      }

      console.log(`[Agent] Executing Internal Code (${language})...`);

      // Store code in memory as INTERNAL
      await this.memory.addMessage('assistant', `[INTERNAL CODE]: ${code}`);

      // Execute
      const output = await this.codeSkill.execute(language || 'bash', code);
      const toolOutput = `\n[SYSTEM: Command Executed. Result Follows:]\n${output}\n`;

      // --- ROUND 2: Reflect & Final Reply ---
      // We construct a NEW prompt focused purely on the RESULT.
      // We do NOT include the full 'userPayload' to prevent re-triggering the "New Message" reflex.

      const round2Prompt = `
CONTEXT HISTORY:
${contextStr}

---
ORIGINAL USER REQUEST:
${message}

YOUR IMMEDIATE ACTION (Just Performed):
${thought || "(Silent Action)"}

EXECUTED CODE (Hidden from user):
${code}

SYSTEM TOOL OUTPUT:
${toolOutput}

CRITICAL INSTRUCTION:
1. The action is COMPLETE. The code has RUN.
2. DO NOT repeat the plan ("I will now...").
3. DO NOT repeat the user's request ("You asked me to...").
4. FOCUS ONLY on the SYSTEM TOOL OUTPUT.
5. Provide the answer/insight directly to the user.
6. If the output is an error, explain it.
7. Keep it conversational (Otome Style).
`;
      let round2Response = await this.llm.chat(systemInstruction, round2Prompt);
      round2Response = round2Response ? round2Response.trim() : "";

      // --- CLEAN ROUND 2 ("Information Filtering") ---
      // Apply the same cleaning logic to the final response
      // Reuse regex (lastIndex is not an issue with match loop/replace)

      while ((matchReaction = reactionRegex.exec(round2Response)) !== null) {
        const emoji = matchReaction[1].trim();
        if (sendReaction && !hasReacted) {
          await sendReaction(emoji);
          hasReacted = true;
        }
      }
      round2Response = round2Response.replace(reactionRegex, '').trim();

      while ((matchImage = imageRegex.exec(round2Response)) !== null) {
        const url = matchImage[1].trim();
        if (sendImage) await sendImage(url);
      }
      round2Response = round2Response.replace(imageRegex, '').trim();
      // -----------------------------------------------

      if (round2Response) {
        await sendReply(round2Response);
        await this.memory.addMessage('assistant', round2Response);
      }
    } else {
      // No code, just talk
      await sendReply(response);
      await this.memory.addMessage('assistant', response);
    }
  }
}
