import fs from 'fs-extra';
import path from 'path';
import { VectorStore, MemoryVector } from './vector-store';
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
  retrieveRelevantMemories(query: string): Promise<string>;
  save(): Promise<void>;
  load(): Promise<void>;
}

export class MemorySystem implements IMemorySystem {
  private shortTerm: MemoryEntry[] = [];
  private vectorStore: VectorStore;
  private llm: LLM;
  private unsummarizedCount: number = 0;

  // Config
  private readonly MAX_SHORT_TERM = 30; // Max messages to keep in sliding window
  private readonly MAX_CONTEXT_TOKENS = 6000; // Reduced to make room for retrieved memories
  private readonly SUMMARIZE_EVERY = 10; // Summarize every N messages

  constructor(
    private storagePath: string,
    llm?: LLM
  ) {
    const vectorPath = path.join(path.dirname(storagePath), 'memories', 'vectors.json');
    this.vectorStore = new VectorStore(vectorPath);
    this.llm = llm || new LLM();
    this.load().catch(() => console.log('No existing memory found, starting fresh.'));
  }

  // Simple token estimator (~1 token per 4 chars for English, ~1 token per 1.5 chars for CJK)
  private estimateTokens(text: string): number {
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 1.5 + otherChars / 4);
  }

  async addMessage(role: 'user' | 'assistant', content: string): Promise<void> {
    console.log(`[Memory] Adding: ${content.substring(0, 50)}...`);
    this.shortTerm.push({
      role,
      content,
      timestamp: Date.now()
    });

    this.unsummarizedCount++;

    // Trigger summarization every N messages
    if (this.unsummarizedCount >= this.SUMMARIZE_EVERY) {
      await this.summarizeAndStore();
    }

    // Simple sliding window
    if (this.shortTerm.length > this.MAX_SHORT_TERM) {
      this.shortTerm = this.shortTerm.slice(-this.MAX_SHORT_TERM);
    }

    // Persist to Markdown for readability
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

  /**
   * Summarize recent messages and store as long-term memory
   */
  private async summarizeAndStore(): Promise<void> {
    console.log(`[Memory] Triggering auto-summarization (${this.unsummarizedCount} messages)`);

    // Get the last N messages to summarize
    const toSummarize = this.shortTerm.slice(-this.unsummarizedCount);

    if (toSummarize.length < 3) {
      console.log('[Memory] Not enough messages to summarize');
      return;
    }

    // Build conversation text
    const conversationText = toSummarize
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    try {
      // Ask LLM to summarize
      const summaryPrompt = `Summarize this conversation in 1-2 sentences. Focus on:
- Key topics discussed
- Important facts learned about the user
- Emotional moments or decisions made
- Any promises or plans mentioned

Conversation:
${conversationText}

Summary (1-2 sentences, be concise):`;

      const summary = await this.llm.chat(
        'You are a helpful assistant that summarizes conversations concisely.',
        summaryPrompt,
        { maxTokens: 150 }
      );

      if (summary && summary.trim()) {
        // Store in vector database
        await this.vectorStore.add(conversationText, summary.trim(), toSummarize.length);
        console.log(`[Memory] Stored summary: "${summary.substring(0, 50)}..."`);
      }
    } catch (e) {
      console.error('[Memory] Summarization failed:', e);
    }

    this.unsummarizedCount = 0;
  }

  /**
   * Retrieve relevant long-term memories based on current query
   */
  async retrieveRelevantMemories(query: string): Promise<string> {
    try {
      const memories = await this.vectorStore.search(query, 3);

      if (memories.length === 0) {
        return '';
      }

      const memoryText = memories
        .map((m, i) => `[Memory ${i + 1} - ${new Date(m.timestamp).toLocaleDateString()}]: ${m.summary}`)
        .join('\n');

      return `\n\nRELEVANT LONG-TERM MEMORIES:\n${memoryText}`;
    } catch (e) {
      console.error('[Memory] Retrieval failed:', e);
      return '';
    }
  }

  async getContext(): Promise<string> {
    let recent = this.shortTerm.slice(-this.MAX_SHORT_TERM);

    // Keep INTERNAL CODE for agent awareness, but truncate long code blocks
    let processed = recent.map(m => {
      if (m.content.startsWith('[INTERNAL CODE]') && m.content.length > 200) {
        return { ...m, content: m.content.substring(0, 200) + '... (truncated)' };
      }
      return m;
    });

    // Dynamic truncation to fit token limit
    let contextStr = this.buildContextString(processed);
    let tokenEstimate = this.estimateTokens(contextStr);

    while (tokenEstimate > this.MAX_CONTEXT_TOKENS && processed.length > 3) {
      processed = processed.slice(1);
      contextStr = this.buildContextString(processed);
      tokenEstimate = this.estimateTokens(contextStr);
    }

    console.log(`[Memory] Context size: ~${tokenEstimate} tokens`);
    return contextStr;
  }

  private buildContextString(messages: MemoryEntry[]): string {
    return JSON.stringify({
      recent_dialogue: messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    }, null, 2);
  }

  async getRecentChat(limit: number = 20): Promise<MemoryEntry[]> {
    return this.shortTerm.slice(-limit);
  }

  async save(): Promise<void> {
    const data = {
      shortTerm: this.shortTerm,
      unsummarizedCount: this.unsummarizedCount,
    };
    await fs.ensureDir(path.dirname(this.storagePath));
    await fs.writeJson(this.storagePath, data, { spaces: 2 });
  }

  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.storagePath)) {
        const data = await fs.readJson(this.storagePath);
        this.shortTerm = data.shortTerm || [];
        this.unsummarizedCount = data.unsummarizedCount || 0;
      }
    } catch (e) {
      console.error('Failed to load memory', e);
    }
  }

  /**
   * Force summarization (for testing or manual trigger)
   */
  async forceSummarize(): Promise<void> {
    this.unsummarizedCount = this.SUMMARIZE_EVERY;
    await this.summarizeAndStore();
  }

  /**
   * Get memory stats
   */
  async getStats(): Promise<{ shortTerm: number; longTerm: number }> {
    const longTermCount = await this.vectorStore.count();
    return {
      shortTerm: this.shortTerm.length,
      longTerm: longTermCount,
    };
  }

  /**
   * Migrate existing chat_history.md to RAG vectors
   * Call this on startup if vectors are empty but chat history exists
   */
  async migrateHistoryToRAG(): Promise<void> {
    const chatHistoryPath = path.join(path.dirname(this.storagePath), 'chat_history.md');

    // Check if migration is needed
    const vectorCount = await this.vectorStore.count();
    if (vectorCount > 0) {
      console.log('[Memory] Vectors already exist, skipping migration');
      return;
    }

    if (!await fs.pathExists(chatHistoryPath)) {
      console.log('[Memory] No chat history to migrate');
      return;
    }

    console.log('[Memory] 🔄 Starting migration of chat history to RAG...');

    try {
      const content = await fs.readFile(chatHistoryPath, 'utf-8');

      // Parse markdown format: **[timestamp] ROLE**: content
      const lines = content.split('\n').filter(l => l.startsWith('**['));
      const messages: { role: string; content: string }[] = [];

      for (const line of lines) {
        const match = line.match(/\*\*\[.*?\] (USER|ASSISTANT)\*\*: (.+)/);
        if (match) {
          messages.push({
            role: match[1].toLowerCase(),
            content: match[2].trim()
          });
        }
      }

      console.log(`[Memory] Found ${messages.length} messages to migrate`);

      if (messages.length < this.SUMMARIZE_EVERY) {
        console.log('[Memory] Not enough messages to migrate');
        return;
      }

      // Process in batches of SUMMARIZE_EVERY
      let migrated = 0;
      for (let i = 0; i < messages.length; i += this.SUMMARIZE_EVERY) {
        const batch = messages.slice(i, i + this.SUMMARIZE_EVERY);
        if (batch.length < 3) continue; // Skip tiny batches

        const conversationText = batch
          .map(m => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n');

        const summaryPrompt = `Summarize this conversation in 1-2 sentences. Focus on:
- Key topics discussed
- Important facts learned about the user
- Emotional moments or decisions made

Conversation:
${conversationText}

Summary (1-2 sentences, be concise):`;

        try {
          const summary = await this.llm.chat(
            'You are a helpful assistant that summarizes conversations concisely.',
            summaryPrompt,
            { maxTokens: 150 }
          );

          if (summary && summary.trim()) {
            await this.vectorStore.add(conversationText, summary.trim(), batch.length);
            migrated++;
            console.log(`[Memory] Migrated batch ${migrated}: "${summary.substring(0, 50)}..."`);
          }

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`[Memory] Failed to migrate batch ${i / this.SUMMARIZE_EVERY}:`, e);
        }
      }

      console.log(`[Memory] ✅ Migration complete! Created ${migrated} memory vectors`);
    } catch (e) {
      console.error('[Memory] Migration failed:', e);
    }
  }
}
