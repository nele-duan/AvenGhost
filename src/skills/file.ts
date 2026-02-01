import { BaseSkill, AgentContext, SkillResult } from '../core/skill';
import fs from 'fs-extra';
import path from 'path';

export class FileSkill extends BaseSkill {
  private sandboxRoot: string;

  constructor() {
    super(
      'file_skill',
      'Read or Write files. Triggers: "read file [path]", "write file [path] [content]", "list files".',
      ['read', 'write', 'list files']
    );
    // Sandbox to "workspace" folder to prevent destroying system
    this.sandboxRoot = path.join(process.cwd(), 'workspace');
    fs.ensureDirSync(this.sandboxRoot);
  }

  async execute(context: AgentContext): Promise<SkillResult> {
    const msg = context.message.toLowerCase();

    try {
      if (msg.includes('list files')) {
        const files = await fs.readdir(this.sandboxRoot);
        return {
          handled: true,
          output: `Files in workspace:\n${files.join('\n') || 'No files.'}`
        };
      }

      if (msg.includes('read')) {
        // Heuristic parsing: "read file.txt"
        const targetMatch = context.message.match(/read\s+([^\s]+)/i);
        if (targetMatch) {
          const filename = targetMatch[1];
          const safePath = this.getSafePath(filename);
          if (!await fs.pathExists(safePath)) {
            return { handled: true, error: `File ${filename} not found.` };
          }
          const content = await fs.readFile(safePath, 'utf-8');
          return { handled: true, output: `Content of ${filename}:\n${content}` };
        }
      }

      if (msg.includes('write')) {
        // Heuristic parsing: "write filename content..."
        // Simple parsing for now. Real agent should use structured args.
        const parts = context.message.split(/\s+/);
        const writeIndex = parts.findIndex(p => p.toLowerCase() === 'write');
        if (writeIndex !== -1 && parts.length > writeIndex + 2) {
          const filename = parts[writeIndex + 1];
          const content = parts.slice(writeIndex + 2).join(' ');
          const safePath = this.getSafePath(filename);

          await fs.outputFile(safePath, content);
          return { handled: true, output: `Saved content to ${filename}.` };
        }
      }

      return { handled: false };

    } catch (e) {
      return { handled: true, error: `File Operation Failed: ${e}` };
    }
  }

  private getSafePath(filename: string): string {
    // Prevent directory traversal
    const safeName = path.basename(filename);
    return path.join(this.sandboxRoot, safeName);
  }
}
