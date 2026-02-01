import { LLM } from './llm';
import { IMemorySystem, MemorySystem } from './memory';
import { AgentContext } from './skill';
// import { CodeSkill } from '../skills/code'; // Dynamic import used inside

export class Agent {
  private llm: LLM;
  private memory: IMemorySystem;
  private systemPrompt: string;
  // No longer map of ISkill (except CodeSkill internally)
  // We handle skills as Text Prompts now + CodeSkill engine
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
    this.systemPrompt = systemPrompt;
  }

  async loadSkills() {
    const fs = require('fs-extra');
    const path = require('path');
    const skillsDir = path.join(__dirname, '../skills');

    try {
      const files = await fs.readdir(skillsDir);
      for (const file of files) {
        if (file.endsWith('.mk') || file.endsWith('.md')) {
          const content = await fs.readFile(path.join(skillsDir, file), 'utf-8');
          this.skillPrompts += `\n---\nSOURCE: ${file}\n${content}\n`;
        }
      }
    } catch (e) {
      console.error('Error loading skills:', e);
    }
  }

  async processMessage(userId: string, message: string): Promise<string> {
    console.log(`[Agent] Processing message from ${userId}: ${message}`);

    // 1. Add User Message
    await this.memory.addMessage('user', message);

    // 2. Prepare Context (History)
    const contextStr = await this.memory.getContext();

    // 3. Construct Initial Prompt
    const header = `${this.systemPrompt}

KNOWN SKILLS / INSTRUCTIONS:
${this.skillPrompts}

CONTEXT:
${contextStr}

USER MESSAGE:
${message}`;

    // --- ROUND 1: Think & Act ---
    let response = await this.llm.chat(header, message);
    console.log(`[Agent] Round 1 Response: ${response.substring(0, 50)}...`);

    // Check for Code Blocks: ```bash ... ```
    const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/; // Regex to find FIRST code block
    const match = codeBlockRegex.exec(response);
    let toolOutput = "";

    if (match) {
      const language = match[1].toLowerCase();
      const code = match[2];

      console.log(`[Agent] Found Code Block (${language})`);

      // Execute Code using the hardcoded engine
      const output = await this.codeSkill.execute(language, code);
      console.log(`[Agent] Code Output available.`);

      toolOutput = `\n[SYSTEM: Command executed. Output below]\n${output}\n`;

      // --- ROUND 2: Interpret & Reply ---
      const followUpPrompt = `${header}\n\nASSISTANT THOUGHT:\n${response}\n\n${toolOutput}\n\nINSTRUCTION: Now reply to the user naturally, incorporating the result above.`;

      response = await this.llm.chat(followUpPrompt, "System: Provide final answer.");
    }

    await this.memory.addMessage('assistant', response);
    return response;
  }
}
