import { BaseSkill, AgentContext, SkillResult } from '../core/skill';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class SystemSkill extends BaseSkill {
  constructor() {
    super(
      'system_skill',
      'Allows checking server status (uptime, date, disk space). Trigger with keywords like "uptime", "status", "server info".',
      ['uptime', 'date', 'status']
    );
  }

  async execute(context: AgentContext): Promise<SkillResult> {
    // Simple heuristic: if message contains keywords, run command.
    // In a real agent, the LLM would explicitly choose to call this.
    // But for this "Simplified" version, we can also let the LLM see the output if it decides to usage it.

    // Actually, adhering to the architecture: The Agent's LLM decides to use this.
    // But here we implement the logic.

    try {
      // Safe commands only
      const { stdout: uptime } = await execAsync('uptime');
      const { stdout: disk } = await execAsync('df -h /');

      return {
        handled: true,
        output: `SERVER STATUS LOG:\nUptime: ${uptime.trim()}\nDisk: ${disk.trim()}`
      };
    } catch (e) {
      return {
        handled: true,
        error: `System Check Failed: ${e}`
      };
    }
  }
}
