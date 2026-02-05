const fs = require('fs');
const path = require('path');
const readline = require('readline');
// Try to load dotenv if available, otherwise ignore
try { require('dotenv').config(); } catch (e) { }

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

  const proceed = await question('Values in brackets [] are current/default. Press Enter to keep them.\nType "y" or "yes" to proceed with setup:', 'y');
  if (!['y', 'yes'].includes(proceed.toLowerCase())) {
    console.log('❌ Setup aborted.');
    process.exit(1);
  }

  console.log('\nThis script will generate your .env file.\n');

  const botToken = await question('Enter your Telegram Bot Token', process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) { console.error('❌ Token is required!'); process.exit(1); }

  const provider = await question('LLM Provider (OpenAI/OpenRouter/Anthropic)', process.env.LLM_PROVIDER || 'OpenRouter');

  const apiKey = await question('Enter your API Key', process.env.OPENAI_API_KEY);
  if (!apiKey) { console.error('❌ API Key is required!'); process.exit(1); }

  let baseUrl = undefined;
  if (provider.toLowerCase() === 'openrouter') {
    baseUrl = await question('Base URL', process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1');
  } else {
    const customUrl = await question('Base URL (Leave empty for default)', process.env.OPENAI_BASE_URL || '');
    if (customUrl) baseUrl = customUrl;
  }

  const defaultModel = provider.toLowerCase() === 'anthropic' ? 'claude-3-opus-20240229' : 'gpt-4o';
  const llmModel = await question('Enter Model Name', process.env.LLM_MODEL || defaultModel);

  const braveKey = await question('Enter Brave Search API Key (Optional)', process.env.BRAVE_SEARCH_API_KEY || '');

  const twilioSid = await question('Twilio Account SID (Optional - for calls)', process.env.TWILIO_ACCOUNT_SID || '');
  let twilioAuth = '';
  let twilioNumber = '';
  let elevenKey = '';
  let elevenVoiceId = '';
  let elevenModel = '';
  let sttKey = '';
  let sttBaseUrl = '';
  let ngrokToken = '';
  let userPhone = '';

  if (twilioSid) {
    twilioAuth = await question('Twilio Auth Token', process.env.TWILIO_AUTH_TOKEN);
    twilioNumber = await question('Twilio Phone Number (e.g., +1234567890)', process.env.TWILIO_PHONE_NUMBER);
    userPhone = await question('Your Phone Number (to receive calls)', process.env.USER_PHONE_NUMBER);
    elevenKey = await question('ElevenLabs API Key', process.env.ELEVENLABS_API_KEY);
    elevenVoiceId = await question('ElevenLabs Voice ID (Aventurine)', process.env.ELEVENLABS_VOICE_ID);
    elevenModel = await question('ElevenLabs Model ID', process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2');

    console.log('\n--- Voice Recognition (STT) ---');
    console.log('We recommend using Groq (free/fast) for speech-to-text.');
    sttKey = await question('STT API Key (Groq/OpenAI)', process.env.STT_API_KEY || process.env.OPENAI_API_KEY);
    sttBaseUrl = await question('STT Base URL', process.env.STT_BASE_URL || 'https://api.groq.com/openai/v1');

    ngrokToken = await question('Ngrok Auth Token', process.env.NGROK_AUTH_TOKEN);
  }

  let envContent = `# AvenGhost Configuration\n`;
  envContent += `TELEGRAM_BOT_TOKEN=${botToken}\n`;
  envContent += `LLM_PROVIDER=${provider}\n`;
  envContent += `OPENAI_API_KEY=${apiKey}\n`;
  envContent += `LLM_MODEL=${llmModel}\n`;

  if (baseUrl) {
    envContent += `OPENAI_BASE_URL=${baseUrl}\n`;
  }

  envContent += `BRAVE_SEARCH_API_KEY=${braveKey}\n`;
  if (twilioSid) {
    envContent += `TWILIO_ACCOUNT_SID=${twilioSid}\n`;
    envContent += `TWILIO_AUTH_TOKEN=${twilioAuth}\n`;
    envContent += `TWILIO_PHONE_NUMBER=${twilioNumber}\n`;
    envContent += `USER_PHONE_NUMBER=${userPhone}\n`;
    envContent += `ELEVENLABS_API_KEY=${elevenKey}\n`;
    envContent += `ELEVENLABS_VOICE_ID=${elevenVoiceId}\n`;
    envContent += `ELEVENLABS_MODEL_ID=${elevenModel}\n`;
    envContent += `STT_API_KEY=${sttKey}\n`;
    envContent += `STT_BASE_URL=${sttBaseUrl}\n`;
    envContent += `NGROK_AUTH_TOKEN=${ngrokToken}\n`;
  }

  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Configuration saved to .env!');
  console.log('You can now run "npm install" and then "npm start", or just "docker-compose up".');

  rl.close();
}

main().catch(console.error);
