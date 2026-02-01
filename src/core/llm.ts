import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export interface LLMConfig {
  provider: 'openai' | 'anthropic'; // For now just OpenAI structure
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLM {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = {
      provider: 'openai',
      model: config.model || 'gpt-4o', // Default to 4o
      temperature: config.temperature ?? 0.7,
      ...config
    };

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL // Optional custom endpoint
    });
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('LLM Error:', error);
      throw new Error('Failed to generate response from LLM');
    }
  }
}
