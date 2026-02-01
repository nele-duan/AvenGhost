import { LLM } from './llm';
import { IMemorySystem, MemorySystem } from './memory';
import { ISkill, AgentContext } from './skill';

export class Agent {
  private llm: LLM;
  private memory: IMemorySystem;
  private skills: Map<string, ISkill> = new Map();
  private systemPrompt: string;

  constructor(
    llm: LLM,
    memory: IMemorySystem,
    systemPrompt: string
  ) {
    this.llm = llm;
    this.memory = memory;
    this.systemPrompt = systemPrompt;
  }

  registerSkill(skill: ISkill) {
    this.skills.set(skill.name, skill);
  }

  async processMessage(userId: string, message: string): Promise<string> {
    console.log(`[Agent] Processing message from ${userId}: ${message}`);

    // 1. Add User Message to Memory
    await this.memory.addMessage('user', message);

    // 2. Prepare Context (Thinking Phase)
    const contextStr = await this.memory.getContext();

    // 3. Construct LLM Prompt
    // We instruct the LLM to either reply directly or call a skill
    const prompt = `
${this.systemPrompt}

AVAILABLE SKILLS:
${Array.from(this.skills.values()).map(s => `- ${s.name}: ${s.description}`).join('\n')}

CONTEXT:
${contextStr}

USER MESSAGE:
${message}
`;

    // 4. Call LLM
    const response = await this.llm.chat(prompt, message);

    // 5. Store Assistant Response
    // TODO: Parse if it's a skill call or a direct reply. For now assuming direct reply.
    await this.memory.addMessage('assistant', response);

    return response;
  }
}
