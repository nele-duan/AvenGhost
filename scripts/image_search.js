const axios = require('axios');
const key = process.env.BRAVE_SEARCH_API_KEY;

if (!key) {
  console.error("Error: BRAVE_SEARCH_API_KEY is missing in environment variables.");
  process.exit(1);
}

const query = process.argv[2];

if (!query) {
  console.error("Usage: node scripts/image_search.js <query>");
  process.exit(1);
}

// console.log(`Searching for: "${query}"...`);

axios.get('https://api.search.brave.com/res/v1/images/search', {
  params: {
    q: query,
    count: 1,
    safe: 'off', // 'off' for memes/variation, 'strict' if family friendly needed
    search_lang: 'en'
  },
  headers: {
    'X-Subscription-Token': key,
    'Accept': 'application/json'
  }
}).then(res => {
  if (res.data && res.data.results && res.data.results.length > 0) {
    const firstResult = res.data.results[0];
    // Output ONLY the URL so the agent can easily capture it
    console.log(firstResult.properties.url);
    // console.log(`(Title: ${firstResult.title})`);
  } else {
    console.log("NO_RESULT");
  }
}).catch(e => {
  console.error(`API Error: ${e.message}`);
  process.exit(1);
});
