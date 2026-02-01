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

  async processMessage(userId: string, message: string, sendReply: (text: string) => Promise<void>): Promise<void> {
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
    const dynamicSystemPrompt = `${soulContent}\n\n${userContent}`;

    // 3. Memory & Context
    await this.memory.addMessage('user', message);
    const contextStr = await this.memory.getContext();

    // 4. Prompt Construction
    const systemInstruction = `${dynamicSystemPrompt}

KNOWN SKILLS / INSTRUCTIONS:
${this.skillPrompts}`;

    const userPayload = `CONTEXT HISTORY:
${contextStr}

CURRENT SYSTEM TIME: ${new Date().toLocaleString()} (Timezone: Server Local)

CURRENT USER MESSAGE:
${message}

CRITICAL INSTRUCTION:
1. DECIDE: Does the user want a task done (search, file, check system)?
2. YES: You MUST output a MARKDOWN CODE BLOCK immediately.
   Format: \`\`\`bash command \`\`\`
   DO NOT just write the command as text.
   DO NOT apologize. just execute.
3. NO: Just chat naturally.
PRIORITY: Action > Talk.
IF YOU DECIDE TO SEARCH:
1. IGNORE "Pure Dialogue" rule for the action part.
2. WRITE THE CODE BLOCK.
3. DO NOT write "I will search". JUST WRITE THE CODE.
`;

    // --- ROUND 1: Think & Act ---
    let response = await this.llm.chat(systemInstruction, userPayload);
    response = response ? response.trim() : "";

    console.log(`[Agent] RAW LLM RESPONSE:\n${response}\n[END RAW]`);

    if (!response) return;

    // Regex to capture code blocks. 
    // Relaxed: Language tag optional-ish (but we strictly asked for it).
    // Captures: ```(lang?) (code) ```
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/;
    const match = codeBlockRegex.exec(response);

    if (match) {
      // Pre-code text?
      const prefix = response.substring(0, match.index).trim();
      if (prefix) {
        await sendReply(prefix);
        await this.memory.addMessage('assistant', prefix);
      }

      let language = match[1] ? match[1].toLowerCase().trim() : 'bash';
      if (language === '') language = 'bash'; // Default

      const code = match[2];
      console.log(`[Agent] Executing Code (${language})...`);

      // Execute
      const output = await this.codeSkill.execute(language, code);
      const toolOutput = `\n[SYSTEM: Command Executed. Result Follows:]\n${output}\n`;

      // --- ROUND 2: Reflect & Final Reply ---
      const round2Prompt = `
${userPayload}

ASSISTANT THOUGHT (Previous Step):
${response}

SYSTEM TOOL OUTPUT:
${toolOutput}

FINAL INSTRUCTION:
Formulate the final response to the user based on the tool output.
`;
      let round2Response = await this.llm.chat(systemInstruction, round2Prompt);
      round2Response = round2Response ? round2Response.trim() : "";

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
