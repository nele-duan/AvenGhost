# AvenGhost 🎲 (Otome Edition)

**Strict. Efficient. Romantic.**

A heavily modified, token-saving fork of the [OpenClaw](https://github.com/openclaw/openclaw/tree/main) architecture, designed specifically for **Ubuntu Cloud Servers**. This version strips away the bloat and replaces it with a **Dynamic Soul Engine** focused on Otome/Romance interactions.

## Core Features
*   **Dynamic Identity**: `data/soul.md` (Self) and `data/users/{id}.md` (You) evolve over time.
*   **Token Efficient**: "Pure Dialogue" protocol minimizes prompt overhead. No COT/ReAct spam unless necessary.
*   **Agentic Capabilities**:
    *   **Proactive Heartbeat**: He checks on you if you're gone too long (09:00-22:00).
    *   **Code Execution**: Real-time Bash/Python execution for searches and system tasks.
    *   **Native Expression**: Supports Telegram Reactions (`[REACTION:❤️]`), Images, and Links.
*   **Dockerized**: One-click deployment.

## Prerequisites
*   Ubuntu Server (22.04LTS/24.04LTS recommended)
*   Docker & Docker Compose
*   Telegram Bot Token
*   OpenAI API Key (or OpenRouter)
*   Brave Search API Key (for web capability)

## Quick Start (Ubuntu)

1.  **Clone & Configure**
    ```bash
    git clone https://github.com/nele-duan/AvenGhost.git
    cd AvenGhost
    npm install
    npm run setup
    # setup TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, BRAVE_SEARCH_API_KEY
    ```

2.  **Deploy (Docker)**
    ```bash
    # Build and start in background
    docker-compose up --build -d
    
    # View logs (to see him wake up)
    docker-compose logs -f
    ```

3.  **Update Strategy**
    To update the bot after changing code:
    ```bash
    git pull
    docker-compose up --build -d  # --build is CRITICAL to apply changes
    ```

## File Structure
*   `src/character.ts`: The static core prompt (Voice/Tone).
*   `data/soul.md`: His dynamic memory and mood (He reads this).
*   `data/users/`: Where he keeps notes about YOU.
*   `src/skills/`: Markdown manuals for his abilities (Search, Code).

## Troubleshooting
*   **"No reaction?"**: Ensure `ctx.react` is supported (Telegraf updated).
*   **"Silent failure?"**: Check logs. If he tries to search but nothing happens, ensure `src/skills` is being copied in `Dockerfile`.