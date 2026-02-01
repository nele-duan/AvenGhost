export interface AgentContext {
  userId: string;
  message: string;
  history: string; // Summarized history + recent messages
  userProfile: {
    name?: string;
    facts: string[];
  };
}

export interface SkillResult {
  handled: boolean;
  output?: string;
  error?: string;
  data?: any;
}

export interface ISkill {
  name: string;
  description: string;
  triggers: string[]; // Keywords or regex to fast-trigger (optional)
  execute(context: AgentContext): Promise<SkillResult>;
}

export abstract class BaseSkill implements ISkill {
  constructor(
    public name: string,
    public description: string,
    public triggers: string[] = []
  ) { }

  abstract execute(context: AgentContext): Promise<SkillResult>;
}
