# Web Search
To search the internet, you must Write Code to call an API.
You have the `BRAVE_SEARCH_API_KEY` in the environment.

## Method
Write a **Python** or **Node.js** script to call `https://api.search.brave.com/res/v1/web/search`.

## Example (Node.js)
\`\`\`javascript
const axios = require('axios');
const key = process.env.BRAVE_SEARCH_API_KEY;

if (!key) {
    console.error("Error: BRAVE_SEARCH_API_KEY is missing in environment.");
    process.exit(1);
}

axios.get('https://api.search.brave.com/res/v1/web/search', {
  params: { q: "latest LLM news", count: 3 },
  headers: { 
      'X-Subscription-Token': key,
      'Accept': 'application/json'
  }
}).then(res => {
  if (res.data && res.data.web && res.data.web.results) {
      res.data.web.results.forEach(r => console.log(`- ${r.title}: ${r.description}`));
  } else {
      console.log("No results found or unexpected format.");
  }
}).catch(err => {
    // Print deep error for debugging
    if (err.response) {
        console.error(`API Error: ${err.response.status} ${JSON.stringify(err.response.data)}`);
    } else {
        console.error(`Network Error: ${err.message}`);
    }
});
\`\`\`
