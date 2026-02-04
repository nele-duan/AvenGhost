const axios = require('axios');
const key = process.env.BRAVE_SEARCH_API_KEY;

const queries = [
  "SDV security safety standards ISO 26262 21434 AI",
  "Software Defined Vehicle AI ethics and liability",
  "autonomous driving AI safety gatekeeper architecture"
];

async function search() {
  for (const query of queries) {
    console.log(`--- Results for: ${query} ---`);
    try {
      const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q: query, count: 3 },
        headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' }
      });
      res.data.web.results.forEach(r => console.log(`- ${r.title}: ${r.description}`));
    } catch (e) { console.error("Search failed"); }
  }
}
search();
