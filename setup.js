const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query, defaultValue) => new Promise((resolve) => {
  rl.question(`${query} ${defaultValue ? `(${defaultValue})` : ''}: `, (answer) => {
    resolve(answer.trim() || defaultValue);
  });
});

async function main() {
  console.log('👻 Welcome to AvenGhost Setup Wizard 👻');
  console.log('---------------------------------------');
  console.log('This script will generate your .env file.\n');

  const botToken = await question('Enter your Telegram Bot Token');
  if (!botToken) { console.error('❌ Token is required!'); process.exit(1); }

  const provider = await question('LLM Provider (OpenAI/OpenRouter/Anthropic)', 'OpenAI');

  const apiKey = await question('Enter your API Key');
  if (!apiKey) { console.error('❌ API Key is required!'); process.exit(1); }

  let baseUrl = undefined;
  if (provider.toLowerCase() === 'openrouter') {
    baseUrl = await question('Base URL', 'https://openrouter.ai/api/v1');
  } else {
    const customUrl = await question('Base URL (Leave empty for default)', '');
    if (customUrl) baseUrl = customUrl;
  }

  const defaultModel = provider.toLowerCase() === 'anthropic' ? 'claude-3-opus-20240229' : 'gpt-4o';
  const llmModel = await question('Enter Model Name', defaultModel);

  const braveKey = await question('Enter Brave Search API Key (Optional)', '');

  let envContent = `# AvenGhost Configuration\n`;
  envContent += `TELEGRAM_BOT_TOKEN=${botToken}\n`;
  envContent += `OPENAI_API_KEY=${apiKey}\n`;
  envContent += `LLM_MODEL=${llmModel}\n`;

  if (baseUrl) {
    envContent += `OPENAI_BASE_URL=${baseUrl}\n`;
  }

  if (braveKey) {
    envContent += `BRAVE_SEARCH_API_KEY=${braveKey}\n`;
  }

  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Configuration saved to .env!');
  console.log('You can now run "npm install" and then "npm start", or just "docker-compose up".');

  rl.close();
}

main().catch(console.error);
