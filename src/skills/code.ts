import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

export class CodeSkill {
  name = 'code_executor';
  description = 'Executes code blocks (bash, javascript, python).';

  async execute(language: string, code: string): Promise<string> {
    console.log(`[CodeSkill] Executing ${language}...`);

    try {
      if (language === 'bash' || language === 'sh') {
        const { stdout, stderr } = await execAsync(code, { cwd: process.cwd() });
        return this.formatOutput(stdout, stderr);
      }

      if (language === 'javascript' || language === 'js' || language === 'node') {
        const tmpFile = path.join(process.cwd(), 'workspace', `temp_${Date.now()}.js`);
        await fs.outputFile(tmpFile, code);
        const { stdout, stderr } = await execAsync(`node ${tmpFile}`, { cwd: process.cwd() });
        await fs.remove(tmpFile);
        return this.formatOutput(stdout, stderr);
      }

      if (language === 'python' || language === 'py') {
        const tmpFile = path.join(process.cwd(), 'workspace', `temp_${Date.now()}.py`);
        await fs.outputFile(tmpFile, code);
        const { stdout, stderr } = await execAsync(`python3 ${tmpFile}`, { cwd: process.cwd() });
        // Clean up immediately
        await fs.remove(tmpFile);

        console.log(`[CodeSkill] STDOUT: ${stdout.substring(0, 100)}...`);
        if (stderr) console.error(`[CodeSkill] STDERR: ${stderr}`);

        return this.formatOutput(stdout, stderr);
      }

      return "Error: Unsupported language. Use bash, javascript, or python.";

    } catch (e: any) {
      return `Execution Failed:\n${e.message}\n${e.stdout || ''}\n${e.stderr || ''}`;
    }
  }

  private formatOutput(stdout: string, stderr: string): string {
    const out = stdout.trim();
    const err = stderr.trim();
    if (out && err) return `[STDOUT]\n${out}\n\n[STDERR]\n${err}`;
    if (out) return out;
    if (err) return `[STDERR]\n${err}`;
    return "(No output)";
  }
}
