import { BaseSkill, AgentContext, SkillResult } from '../core/skill';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class SearchSkill extends BaseSkill {
  private apiKey: string | undefined;

  constructor() {
    super(
      'search_skill',
      'Search the web for information using Brave Search. Triggers: "search [query]", "google [query]", "find [query]".',
      ['search', 'find', 'lookup']
    );
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY;
  }

  async execute(context: AgentContext): Promise<SkillResult> {
    if (!this.apiKey) {
      return { handled: true, error: 'Search failed: BRAVE_SEARCH_API_KEY not configured.' };
    }

    const msg = context.message.toLowerCase();
    // Parse query: "search for X" or "search X"
    const match = context.message.match(/(?:search|find|lookup)\s+(?:for\s+)?(.+)/i);

    if (!match) return { handled: false };

    const query = match[1];

    try {
      console.log(`[SearchSkill] Searching Brave for: ${query}`);
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: {
          q: query,
          count: 3
        },
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey
        }
      });

      const results = response.data.web?.results || [];
      if (results.length === 0) {
        return { handled: true, output: `No results found for "${query}".` };
      }

      const summary = results.map((r: any) => `- [${r.title}](${r.url}): ${r.description}`).join('\n');
      return {
        handled: true,
        output: `Here is what I found on the web:\n${summary}`
      };

    } catch (e) {
      return { handled: true, error: `Search API Error: ${e}` };
    }
  }
}
