import fs from 'fs-extra';
import path from 'path';

export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface IMemorySystem {
  addMessage(role: 'user' | 'assistant', content: string): Promise<void>;
  getContext(): Promise<string>;
  getRecentChat(limit?: number): Promise<MemoryEntry[]>;
  save(): Promise<void>;
  load(): Promise<void>;
}

export class MemorySystem implements IMemorySystem {
  private shortTerm: MemoryEntry[] = [];

  // No more automatic summary or profile tracking. 
  // The Agent uses the filesystem for these.

  // Config
  private readonly MAX_SHORT_TERM = 50; // Increased buffer since we don't summarize

  constructor(
    private storagePath: string,
    // No LLM needed for the memory system itself anymore
  ) {
    this.load().catch(() => console.log('No existing memory found, starting fresh.'));
  }

  async addMessage(role: 'user' | 'assistant', content: string): Promise<void> {
    console.log(`[Memory] Adding: ${content.substring(0, 50)}...`);
    this.shortTerm.push({
      role,
      content,
      timestamp: Date.now()
    });

    // Simple sliding window
    if (this.shortTerm.length > this.MAX_SHORT_TERM) {
      // Just slice, no summarization.
      // The Agent acts as its own archivist using files.
      this.shortTerm = this.shortTerm.slice(-this.MAX_SHORT_TERM);
    }

    // [NEW] Persist to Markdown for readability (User Request)
    try {
      const mdLogPath = path.join(path.dirname(this.storagePath), 'chat_history.md');
      const timestamp = new Date().toLocaleString();
      const mdLine = `\n**[${timestamp}] ${role.toUpperCase()}**: ${content}\n`;
      await fs.appendFile(mdLogPath, mdLine);
    } catch (e) {
      console.error('Failed to log to MD:', e);
    }

    await this.save();
  }

  async getContext(): Promise<string> {
    const recent = this.shortTerm.slice(-this.MAX_SHORT_TERM);
    return JSON.stringify({
      recent_dialogue: recent.map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    }, null, 2);
  }

  async getRecentChat(limit: number = 20): Promise<MemoryEntry[]> {
    return this.shortTerm.slice(-limit);
  }

  async save(): Promise<void> {
    const data = {
      shortTerm: this.shortTerm,
    };
    await fs.ensureDir(path.dirname(this.storagePath));
    await fs.writeJson(this.storagePath, data, { spaces: 2 });
  }

  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.storagePath)) {
        const data = await fs.readJson(this.storagePath);
        this.shortTerm = data.shortTerm || [];
      }
    } catch (e) {
      console.error('Failed to load memory', e);
    }
  }
}
