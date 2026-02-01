# Web Search
To search the internet, you MUST write a **Node.js** script to call the Brave Search API.
You have the `BRAVE_SEARCH_API_KEY` in the environment.

## CRITICAL:
- DO NOT output "search query".
- DO NOT ask permission.
- OUTPUT THE CODE BLOCK IMMEDIATELY.

## Example (Node.js)
\`\`\`javascript
const axios = require('axios');
const key = process.env.BRAVE_SEARCH_API_KEY;

if (!key) { console.error("No API Key"); process.exit(1); }

// Query based on user input
const query = "latest LLM news feburary 2026"; 

console.log("Searching for:", query);

axios.get('https://api.search.brave.com/res/v1/web/search', {
  params: { q: query, count: 5 },
  headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' }
}).then(res => {
  if (res.data.web.results) {
      res.data.web.results.forEach(r => console.log(`- ${r.title}: ${r.description}\n  Link: ${r.url}\n`));
  } else {
      console.log("No results.");
  }
}).catch(e => console.error(e.message));
\`\`\`
