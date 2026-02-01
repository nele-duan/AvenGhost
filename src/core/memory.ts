import fs from 'fs-extra';
import path from 'path';
import { LLM } from './llm';

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
  private summary: string = "Nothing yet.";
  private userProfile: string[] = [];

  // Config
  private readonly MAX_SHORT_TERM = 10;

  constructor(
    private storagePath: string,
    private llm: LLM // Need LLM for summarization
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

    // Trigger optimization if buffer gets too big
    if (this.shortTerm.length > this.MAX_SHORT_TERM * 2) {
      await this.optimizeMemory();
    }

    await this.save();
  }

  async getContext(): Promise<string> {
    // Construct the prompt context
    // We present the "Novel Summary" first, then the recent raw chat.
    const recent = this.shortTerm.slice(-this.MAX_SHORT_TERM);

    return JSON.stringify({
      summary_so_far: this.summary,
      known_user_facts: this.userProfile,
      recent_dialogue: recent.map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    }, null, 2);
  }

  async getRecentChat(limit: number = 20): Promise<MemoryEntry[]> {
    return this.shortTerm.slice(-limit);
  }

  // The "Optimization" Logic
  private async optimizeMemory() {
    console.log('[Memory] Optimizing (Compressing)...');

    // 1. Identify older messages to banish to the shadow realm (summary)
    const toSummarize = this.shortTerm.slice(0, this.shortTerm.length - this.MAX_SHORT_TERM);
    this.shortTerm = this.shortTerm.slice(this.shortTerm.length - this.MAX_SHORT_TERM);

    if (toSummarize.length === 0) return;

    // 2. Ask LLM to update the summary
    const dialogueText = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');

    const prompt = `
You are a Memory Compressor.
Current Summary of the story: "${this.summary}"

New Dialogue to merge:
${dialogueText}

INSTRUCTIONS:
1. Update the "Current Summary" to include key events/revelations from the "New Dialogue".
2. Write in a third-person novel style.
3. Keep it concise but retain emotional nuance (Romance/Otome style).
4. EXTRACT any new facts about the user (e.g. name, likes, dislikes) into a separate list.

OUTPUT FORMAT:
JSON with fields: { "new_summary": string, "new_facts": string[] }
`;

    try {
      const resultRaw = await this.llm.chat(prompt, "Compress this memory.");
      // Simple parsing (real implementation should use Zod/structured output)
      const result = JSON.parse(resultRaw.replace(/```json|```/g, '').trim());

      this.summary = result.new_summary || this.summary;
      if (result.new_facts && Array.isArray(result.new_facts)) {
        this.userProfile = [...new Set([...this.userProfile, ...result.new_facts])];
      }

      console.log('[Memory] Compressed successfully. New Summary Length:', this.summary.length);
    } catch (err) {
      console.error('[Memory] Compression failed:', err);
      // If failed, we put the messages back? Or just drop them? 
      // Ideally we shouldn't lose data, but for this simplified version we'll just log.
    }
  }

  async save(): Promise<void> {
    const data = {
      shortTerm: this.shortTerm,
      summary: this.summary,
      userProfile: this.userProfile
    };
    await fs.ensureDir(path.dirname(this.storagePath));
    await fs.writeJson(this.storagePath, data, { spaces: 2 });
  }

  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.storagePath)) {
        const data = await fs.readJson(this.storagePath);
        this.shortTerm = data.shortTerm || [];
        this.summary = data.summary || "Start of relationship.";
        this.userProfile = data.userProfile || [];
      }
    } catch (e) {
      console.error('Failed to load memory', e);
    }
  }
}
