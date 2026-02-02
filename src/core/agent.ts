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
    } catch (e: any) {
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
      const templatePath = path.join(userDir, 'template.md');

      if (await fs.pathExists(userPath)) {
        userContent = await fs.readFile(userPath, 'utf-8');
      } else {
        console.log(`[Agent] New user ${userId} detected. Creating profile...`);
        if (await fs.pathExists(templatePath)) {
          userContent = await fs.readFile(templatePath, 'utf-8');
        } else {
          userContent = `# USER PROFILE (${userId})\nFirst interaction: ${new Date().toISOString()}\n\n## NOTES\n(No data yet)`;
        }
        await fs.writeFile(userPath, userContent);
      }
    } catch (e: any) {
      console.error('[Agent] Error loading Dynamic Identity:', e);
    }

    // 2. Construct System Prompt
    const dynamicSystemPrompt = `${this.defaultSystemPrompt}\n\n${soulContent}\n\n${userContent}`;

    // 3. Memory & Context
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

GIT PROTOCOL (SAFETY FIRST):
1. PROTECT MAIN: You are FORBIDDEN from committing or pushing directly to 'main' or 'master'.
2. BRANCHING: ALWAYS create a new branch for changes: 'git checkout -b feature/your-topic'.
3. WORKFLOW:
   - Make changes.
   - 'git commit -am "chore: description"'
   - 'git push -u origin feature/your-topic'
   - NOTIFY USER: "I have pushed changes to branch 'feature/xxx'. Please review and merge."

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
7. BATCH OPERATIONS:
   - DO NOT split tasks into small steps (e.g. Turn 1: check file, Turn 2: read file).
   - DO IT ALL IN ONE TURN: "check file && read file".
   - Maximizing efficiency saves the user money.
8. SELF-EVOLUTION (CRITICAL):
   - IF you need to edit your own source code (src/**/*.ts):
   - FORBIDDEN: Do NOT use echo or write directly to src/. You will crash and die.
   - REQUIRED:
     1. Write new code to temp/new_file.ts.
     2. Run: ./scripts/evolve.sh src/path/target.ts temp/new_file.ts feature/branch-name "commit msg".
   - The script checks syntax. If it fails, you live. If you hack it, you die.
`;


    // --- REACT LOOP (Max 20 Turns) ---
    let turnCount = 0;
    const MAX_TURNS = 20;
    let finalPayload = userPayload;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      // Chat with LLM
      let response = await this.llm.chat(systemInstruction, finalPayload);
      response = response ? response.trim() : "";

      // 1. Clean Reactions
      const reactionRegex = /(?:\[\s*)?REACTION\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
      let matchReaction;
      let hasReacted = false;
      while ((matchReaction = reactionRegex.exec(response)) !== null) {
        const emoji = matchReaction[1].trim();
        if (sendReaction && turnCount === 1 && !hasReacted) { // Only react on Turn 1
          await sendReaction(emoji);
          hasReacted = true;
        }
      }
      response = response.replace(reactionRegex, '').trim();

      // 2. Clean Images
      const imageRegex = /(?:\[\s*)?IMAGE\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
      let matchImage;
      while ((matchImage = imageRegex.exec(response)) !== null) {
        const url = matchImage[1].trim();
        if (sendImage) await sendImage(url);
      }
      response = response.replace(imageRegex, '').trim();

      // 3. Check for Code Block
      const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/;
      const match = codeBlockRegex.exec(response);

      if (match) {
        // --- ACTION DETECTED ---
        const thought = response.substring(0, match.index).trim();
        const language = match[1] ? match[1].toLowerCase().trim() : 'bash';
        const code = match[2];

        // Send "Thought" (User sees progress)
        if (thought) {
          // [VERBOSE MODE REQUESTED]
          await sendReply(thought);
          await this.memory.addMessage('assistant', thought);
        }

        console.log(`[Agent] Turn ${turnCount}: Executing ${language}...`);
        await this.memory.addMessage('assistant', `[INTERNAL CODE]: ${code}`);

        // Execute
        let output = "";
        try {
          output = await this.codeSkill.execute(language || 'bash', code);
        } catch (err: any) {
          output = `Error: ${err.message}`;
        }

        const toolOutput = `\n[SYSTEM: Command Executed. Result Follows:]\n${output}\n`;

        // PREPARE FOR NEXT TURN
        finalPayload += `\n\n[ASSISTANT PREVIOUSLY SAID]: ${thought || "(Silent Action)"}\n[EXECUTED CODE]: ${code}\n${toolOutput}\n\nCRITICAL: 1. Review the result. 2. If done, reply to user. 3. If more steps needed, output next Code Block.`;

        // Continue loop...
      } else {
        // --- NO CODE / FINAL REPLY ---
        if (response) {
          await sendReply(response);
          await this.memory.addMessage('assistant', response);
        }
        break; // EXIT LOOP
      }
    }

    if (turnCount >= MAX_TURNS) {
      console.log("[Agent] Turn limit reached. Stopping loop.");
      // await sendReply("(System: Max turns reached. I stopped to prevent infinite loops.)");
    }
  }
}
