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

  console.log('\n⚠️  CRITICAL SECURITY WARNING ⚠️');
  console.log('You are about to give this Agent FULL ADMINISTRATOR/ROOT privileges.');
  console.log('It will be able to execute ANY code, modify files, and control this server.');
  console.log('Use with extreme caution. Do not run this on a shared production server.');

  const proceed = await question('Type "I AGREE" to proceed with root access setup:', '');
  if (proceed !== 'I AGREE') {
    console.log('❌ Setup aborted for safety.');
    process.exit(1);
  }

  console.log('\nThis script will generate your .env file.\n');

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

  const twilioSid = await question('Twilio Account SID (Optional - for calls)', '');
  let twilioAuth = '';
  let twilioNumber = '';
  let elevenKey = '';
  let elevenVoiceId = '';
  let elevenModel = '';
  let ngrokToken = '';
  let userPhone = '';

  if (twilioSid) {
    twilioAuth = await question('Twilio Auth Token');
    twilioNumber = await question('Twilio Phone Number (e.g., +1234567890)');
    userPhone = await question('Your Phone Number (to receive calls)');
    elevenKey = await question('ElevenLabs API Key');
    elevenVoiceId = await question('ElevenLabs Voice ID (Aventurine)');
    elevenModel = await question('ElevenLabs Model ID', 'eleven_multilingual_v2');
    ngrokToken = await question('Ngrok Auth Token');
  }

  let envContent = `# AvenGhost Configuration\n`;
  envContent += `TELEGRAM_BOT_TOKEN=${botToken}\n`;
  envContent += `OPENAI_API_KEY=${apiKey}\n`;
  envContent += `LLM_MODEL=${llmModel}\n`;

  if (baseUrl) {
    envContent += `OPENAI_BASE_URL=${baseUrl}\n`;
  }

  envContent += `BRAVE_SEARCH_API_KEY=${braveKey}\n`;
}

if (twilioSid) {
  envContent += `TWILIO_ACCOUNT_SID=${twilioSid}\n`;
  envContent += `TWILIO_AUTH_TOKEN=${twilioAuth}\n`;
  envContent += `TWILIO_PHONE_NUMBER=${twilioNumber}\n`;
  envContent += `USER_PHONE_NUMBER=${userPhone}\n`;
  envContent += `ELEVENLABS_API_KEY=${elevenKey}\n`;
  envContent += `ELEVENLABS_VOICE_ID=${elevenVoiceId}\n`;
  envContent += `ELEVENLABS_MODEL_ID=${elevenModel}\n`;
  envContent += `NGROK_AUTH_TOKEN=${ngrokToken}\n`;
}

const envPath = path.join(process.cwd(), '.env');
fs.writeFileSync(envPath, envContent);

console.log('\n✅ Configuration saved to .env!');
console.log('You can now run "npm install" and then "npm start", or just "docker-compose up".');

rl.close();

main().catch(console.error);
