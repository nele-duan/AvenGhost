# Web Search
To search the internet, you must Write Code to call an API.
You have the `BRAVE_SEARCH_API_KEY` in the environment.

## Method
Write a **Python** or **Node.js** script to call `https://api.search.brave.com/res/v1/web/search`.

## Example (Node.js)
\`\`\`javascript
const axios = require('axios');
const key = process.env.BRAVE_SEARCH_API_KEY;
axios.get('https://api.search.brave.com/res/v1/web/search', {
  params: { q: "latest LLM news", count: 3 },
  headers: { 'X-Subscription-Token': key }
}).then(res => {
  res.data.web.results.forEach(r => console.log(`- ${r.title}: ${r.description}`));
}).catch(err => console.error(err.message));
\`\`\`
