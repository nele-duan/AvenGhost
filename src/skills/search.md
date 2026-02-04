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
// ... (Web Search Script above) ...

## Image Search (Node.js)
To share an image (Meme/Sticker/Vibe), you MUST search for a **real URL** first.
**Strategy**: Append keywords like "meme", "funny", "sticker", "reaction" to your query to find suitable chat images.
\`\`\`javascript
const axios = require('axios');
const key = process.env.BRAVE_SEARCH_API_KEY;

if (!key) { console.error("No API Key"); process.exit(1); }

// Context: User is being silly.
// Goal: Send a confused reaction.
const query = "confused cat meme funny"; 

console.log("Searching for image:", query);

axios.get('https://api.search.brave.com/res/v1/images/search', {
  params: { q: query, count: 1, safe: 'off' }, // safe: off for better meme results
  headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' }
}).then(res => {
  if (res.data.results && res.data.results.length > 0) {
      // OUTPUT THE FORMATTED TAG DIRECTLY
      const img = res.data.results[0];
      console.log(`[IMAGE:${img.properties.url}]`); 
      console.log(`(Source: ${img.title})`);
  } else {
      console.log("No images found.");
  }
}).catch(e => console.error(e.message));
\`\`\`
