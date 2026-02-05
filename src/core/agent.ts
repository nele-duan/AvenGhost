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
    sendReply: (text: string, mode?: 'Markdown' | 'HTML') => Promise<void>,
    sendReaction?: (emoji: string) => Promise<void>,
    sendImage?: (url: string, caption?: string) => Promise<void>,
    sendSticker?: (fileId: string) => Promise<void>,
    sendCall?: (text: string) => Promise<void>,
    disableTools: boolean = false
  ): Promise<void> {
    console.log(`[Agent] Processing message from ${userId}: ${message}`);
    const fs = require('fs-extra');
    const path = require('path');

    // ... (lines 74-291 unchanged) ...

    // 4. Check for Code Block
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/;
    const match = codeBlockRegex.exec(response);

    if (match && !disableTools) {
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

      // [UX] Send the code block using HTML for better reliability
      const escapeHtml = (unsafe: string) => {
        return unsafe
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      };

      const codeBlock = `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;

      // Pass 'HTML' as the second argument to sendReply
      await sendReply(codeBlock, 'HTML');

      await this.memory.addMessage('assistant', `[INTERNAL CODE]: ${code}`);

      // Execute
      let output = "";
      try {
        output = await this.codeSkill.execute(language || 'bash', code);
      } catch (err: any) {
        output = `Error: ${err.message}`;
      }

      const toolOutput = `\n[SYSTEM: Command Executed.Result Follows:]\n${output}\n`;

      // PREPARE FOR NEXT TURN
      // To prevent spamming multiple searches in one go, we limit tool usage.
      if (language === 'bash' && code.includes('image_search')) {
        finalPayload += `\n\n[SYSTEM]: Image search executed. STOP TOOL USAGE. Reply to user now.`;
      } else {
        finalPayload += `\n\n[ASSISTANT PREVIOUSLY SAID]: ${thought || "(Silent Action)"} \n[EXECUTED CODE]: ${code} \n${toolOutput} \n\nCRITICAL: 1. Review the result. 2. If done, reply to user. 3. If more steps needed, output next Code Block.`;
      }

      // Continue loop...
    } else {
      // --- NO CODE / FINAL REPLY ---
      if (response) {
        // Clean excessive newlines (max 2 newlines = 1 empty line)
        response = response.replace(/\n{3,}/g, '\n\n').trim();
        await sendReply(response);
        await this.memory.addMessage('assistant', response);
      }
      break; // EXIT LOOP
    }
  }

  if(turnCount >= MAX_TURNS) {
  console.log("[Agent] Turn limit reached. Stopping loop.");
  // await sendReply("(System: Max turns reached. I stopped to prevent infinite loops.)");
}
  }
}
