import { LLM } from './llm';
import { IMemorySystem, MemorySystem } from './memory';
import { AgentContext } from './skill';
// import { CodeSkill } from '../skills/code'; // Dynamic import used inside

export class Agent {
  private llm: LLM;
  private memory: IMemorySystem;
  private systemPrompt: string;
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

  // Refactored to accept callback for multiple replies
  async processMessage(userId: string, message: string, sendReply: (text: string) => Promise<void>): Promise<void> {
    console.log(`[Agent] Processing message from ${userId}: ${message}`);

    await this.memory.addMessage('user', message);
    const contextStr = await this.memory.getContext();

    // Prompt Construction
    const systemInstruction = `${this.systemPrompt}

KNOWN SKILLS / INSTRUCTIONS:
${this.skillPrompts}`;

    const userPayload = `CONTEXT HISTORY:
${contextStr}

CURRENT USER MESSAGE:
${message}

INSTRUCTION: 
If you simply want to talk, just reply.
If you need to use a tool, output the code block.
You may send a short acknowledgement first if the task is long.`;

    // --- ROUND 1: Think & Act ---
    let response = await this.llm.chat(systemInstruction, userPayload);
    response = response ? response.trim() : "";

    // If response contains "I will check..." or similar conversational filler AND a code block,
    // we should ideally split it. But for now, let's just send the non-code part?
    // Actually, user wants "Multiple replies".
    // If LLM says: "Okay checking... ```bash ls ```", we should send "Okay checking..." then run code.

    if (!response) {
      return;
    }

    const codeBlockRegex = /```(\w+)\n([\s\S]*?)```/;
    const match = codeBlockRegex.exec(response);

    if (match) {
      // We found code.
      // Did we say something BEFORE the code?
      const prefix = response.substring(0, match.index).trim();
      if (prefix) {
        await sendReply(prefix);
        await this.memory.addMessage('assistant', prefix);
      }

      const language = match[1].toLowerCase();
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
