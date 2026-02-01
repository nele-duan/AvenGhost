const fs = require('fs-extra');
const path = require('path');

async function main() {
  // Dynamic import for inquirer (ESM package)
  const { default: inquirer } = await import('inquirer');

  console.log('👻 Welcome to AvenGhost Setup Wizard 👻');
  console.log('---------------------------------------');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'TELEGRAM_BOT_TOKEN',
      message: 'Enter your Telegram Bot Token:',
      validate: (input) => input.length > 10 ? true : 'Token seems too short.'
    },
    {
      type: 'list',
      name: 'PROVIDER',
      message: 'Which LLM Provider are you using?',
      choices: ['OpenAI', 'OpenRouter', 'Anthropic']
    },
    {
      type: 'input',
      name: 'OPENAI_API_KEY',
      message: 'Enter your API Key:',
      validate: (input) => input.length > 5 ? true : 'Key required.'
    },
    {
      type: 'input',
      name: 'OPENAI_BASE_URL',
      message: 'Enter Base URL (Leave empty for default):',
      default: (answers) => answers.PROVIDER === 'OpenRouter' ? 'https://openrouter.ai/api/v1' : undefined,
      when: (answers) => answers.PROVIDER === 'OpenRouter' || answers.PROVIDER === 'OpenAI'
    },
    {
      type: 'input',
      name: 'LLM_MODEL',
      message: 'Enter Model Name (e.g. gpt-4o, anthropic/claude-3.5-sonnet):',
      default: 'gpt-4o'
    },
    {
      type: 'input',
      name: 'BRAVE_SEARCH_API_KEY',
      message: 'Enter Brave Search API Key (Optional):',
    }
  ]);

  let envContent = `# AvenGhost Configuration\n`;
  envContent += `TELEGRAM_BOT_TOKEN=${answers.TELEGRAM_BOT_TOKEN}\n`;
  envContent += `OPENAI_API_KEY=${answers.OPENAI_API_KEY}\n`;
  envContent += `LLM_MODEL=${answers.LLM_MODEL}\n`;

  if (answers.OPENAI_BASE_URL) {
    envContent += `OPENAI_BASE_URL=${answers.OPENAI_BASE_URL}\n`;
  }

  if (answers.BRAVE_SEARCH_API_KEY) {
    envContent += `BRAVE_SEARCH_API_KEY=${answers.BRAVE_SEARCH_API_KEY}\n`;
  }

  const envPath = path.join(process.cwd(), '.env');
  await fs.writeFile(envPath, envContent);

  console.log('\n✅ Configuration saved to .env!');
  console.log('You can now run "npm start" or "docker-compose up".');
}

main().catch(console.error);
