import fs from 'fs-extra';
import path from 'path';
import { getEmbedding, cosineSimilarity, EMBEDDING_DIMENSIONS } from './embedding';

export interface MemoryVector {
  id: string;
  text: string;
  summary: string;
  embedding: number[];
  timestamp: number;
  messageCount: number; // Number of messages this summary covers
}

export class VectorStore {
  private vectors: MemoryVector[] = [];
  private storagePath: string;
  private loaded: boolean = false;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (await fs.pathExists(this.storagePath)) {
        const data = await fs.readJson(this.storagePath);
        this.vectors = data.vectors || [];
        console.log(`[VectorStore] Loaded ${this.vectors.length} memory vectors`);
      }
    } catch (e) {
      console.error('[VectorStore] Failed to load:', e);
      this.vectors = [];
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.storagePath));
      await fs.writeJson(this.storagePath, { vectors: this.vectors }, { spaces: 2 });
    } catch (e) {
      console.error('[VectorStore] Failed to save:', e);
    }
  }

  /**
   * Add a new memory to the vector store
   */
  async add(text: string, summary: string, messageCount: number): Promise<void> {
    await this.load();

    console.log(`[VectorStore] Embedding summary: "${summary.substring(0, 50)}..."`);
    const embedding = await getEmbedding(summary);

    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.vectors.push({
      id,
      text,
      summary,
      embedding,
      timestamp: Date.now(),
      messageCount,
    });

    // Keep only the last 100 memories to avoid bloat
    if (this.vectors.length > 100) {
      this.vectors = this.vectors.slice(-100);
    }

    await this.save();
    console.log(`[VectorStore] Added memory ${id}, total: ${this.vectors.length}`);
  }

  /**
   * Search for relevant memories using semantic similarity
   */
  async search(query: string, topK: number = 3): Promise<MemoryVector[]> {
    await this.load();

    if (this.vectors.length === 0) {
      return [];
    }

    console.log(`[VectorStore] Searching for: "${query.substring(0, 50)}..."`);
    const queryEmbedding = await getEmbedding(query);

    // Calculate similarity scores
    const scored = this.vectors.map(v => ({
      vector: v,
      score: cosineSimilarity(queryEmbedding, v.embedding),
    }));

    // Sort by similarity (highest first) and take top K
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK);

    // Only return memories with reasonable similarity (> 0.3)
    const filtered = results.filter(r => r.score > 0.3);

    console.log(`[VectorStore] Found ${filtered.length} relevant memories (scores: ${filtered.map(r => r.score.toFixed(2)).join(', ')})`);

    return filtered.map(r => r.vector);
  }

  /**
   * Get total count of stored memories
   */
  async count(): Promise<number> {
    await this.load();
    return this.vectors.length;
  }

  /**
   * Get all memories (for debugging)
   */
  async getAll(): Promise<MemoryVector[]> {
    await this.load();
    return this.vectors;
  }
}
