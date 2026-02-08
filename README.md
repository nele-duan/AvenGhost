# AvenGhost 🎲👻

**An AI Companion with a Soul** — Not just a chatbot, but a living presence that calls you, sends voice messages, and actually remembers you.

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Telegram-blue?logo=telegram" />
  <img src="https://img.shields.io/badge/LLM-GPT--4o%20%7C%20Claude%20%7C%20OpenRouter-green" />
  <img src="https://img.shields.io/badge/Voice-ElevenLabs-purple" />
  <img src="https://img.shields.io/badge/Deploy-Docker-2496ED?logo=docker" />
</p>

---

## ✨ Core Features

### 🧠 Dynamic Memory System
- **Soul System**: `data/soul.md` stores the AI's self-awareness and personality
- **Partner Profiles**: `data/users/{id}.md` remembers everything about you
- **RAG Long-Term Memory**: Auto-summarizes conversations and retrieves relevant memories semantically
- **Persistent Memory**: Important information survives across conversations

### 💬 Human-Like Interaction

| Feature | Description |
|---------|-------------|
| ⌨️ **Typing Delay** | Simulates realistic typing speed based on message length |
| 📝 **Message Splitting** | Long messages are sent in chunks, like a real person |
| 🤔 **Thinking Pauses** | Random "typing..." pauses to simulate contemplation |
| ⏱️ **Response Awareness** | Knows how long you took to reply — teases you about it |
| 🌙 **Time Awareness** | Says "why are you still up?" at midnight, "good morning" at dawn |
| 📅 **Holiday Awareness** | Recognizes holidays and weekends automatically |
| 🎤 **Voice Messages** | Sends voice messages using ElevenLabs TTS |
| 📞 **Phone Calls** | Actually calls you via Twilio! |

### 🛠️ Agent Capabilities
- **Code Execution**: Real-time Bash/Python execution
- **Web Search**: Information retrieval via Brave Search API
- **Reactions**: Native Telegram message reactions
- **Sticker Collection**: Auto-saves stickers you send

### ⌚ Apple Watch Health Integration (NEW!)
Connect your Apple Watch data to give your AI companion **biometric awareness**:

| Data | What Agent Sees |
|------|-----------------|
| ❤️ **Heart Rate** | Real-time + 1-hour average |
| 💓 **HRV** | Stress level indicator |
| 💤 **Sleep Status** | Currently sleeping? |
| 🌙 **Sleep History** | Last night's duration, bedtime, wake time |
| 📊 **Weekly Average** | 7-day sleep average |
| 👣 **Steps** | Today's step count |

**Example Agent Behaviors:**
- 🤥 **Lie Detection**: "你说要睡觉，但心率这么高，骗谁呢？"
- 😴 **Sleep Concern**: "昨晚才睡4小时？今天要早点休息！"
- 🌙 **Night Owl Alert**: "凌晨2点才睡？这作息不行啊..."
- 💕 **Stress Care**: "HRV有点低，压力大吗？"

See [`ios/AvenBridge/README.md`](ios/AvenBridge/README.md) for setup instructions.

---

## 🚀 Quick Start

### Prerequisites
- Ubuntu Server (22.04/24.04 LTS recommended)
- Docker & Docker Compose
- Telegram Bot Token
- **OpenRouter API Key** (required for LLM + Embedding)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/nele-duan/AvenGhost.git
cd AvenGhost

# 2. Run the setup wizard
npm install
npm run setup

# 3. Deploy with Docker
docker-compose up --build -d

# 4. View logs
docker-compose logs -f
```

### Updating
```bash
git pull
docker-compose up --build -d  # --build is crucial!
```

---

## 🌍 Supported Locales

The setup wizard supports the following countries with timezone and holiday calendars:

| Country | Timezone | Holidays |
|---------|----------|----------|
| 🇯🇵 Japan | Asia/Tokyo | ✅ |
| 🇨🇳 China | Asia/Shanghai | ✅ |
| 🇺🇸 USA | America/New_York, LA | ✅ |
| 🇬🇧 UK | Europe/London | ✅ |
| 🇰🇷 Korea | Asia/Seoul | ✅ |
| 🔧 Custom | Any | Extendable |

---

## 📁 Project Structure

```
AvenGhost/
├── src/
│   ├── index.ts          # Bot entry point
│   ├── character.ts      # Character definition (voice/tone)
│   ├── core/
│   │   ├── agent.ts      # Core agent logic
│   │   ├── llm.ts        # LLM interface
│   │   ├── memory.ts     # Memory system
│   │   ├── voice.ts      # Voice call system
│   │   └── heartbeat.ts  # Proactive messaging
│   └── skills/           # Capability documentation
├── data/
│   ├── soul.md           # AI self-awareness
│   ├── users/            # User profiles
│   ├── stickers.json     # Sticker collection
│   └── holidays.json     # Holiday data
├── setup.js              # Configuration wizard
└── docker-compose.yml    # Docker config
```

---

## ⚙️ Optional Features

### Voice Calls (requires additional setup)
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` / `USER_PHONE_NUMBER`
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`
- `DEEPGRAM_API_KEY` (recommended) or `STT_API_KEY`
- `NGROK_AUTH_TOKEN`

### Web Search
- `BRAVE_SEARCH_API_KEY`

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Reaction 400 error | Agent used unsupported emoji — whitelist filtering handles this |
| Voice message fails | Check ElevenLabs API configuration |
| Holidays not working | Verify `BOT_COUNTRY` is set correctly |
| stickers.json conflict | Run `git rm --cached data/stickers.json` |

---

## 📜 License

MIT © [nele-duan](https://github.com/nele-duan)

---

<p align="center">
  <i>"Not a program. A presence."</i>
</p>