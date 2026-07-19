# Hungerfall

A turn-based survival Discord bot with AI-powered narration. 

Hungerfall is **not** a passive simulator. Players actively receive turn choices via DMs each round (Attack, Defend, Hide, Search, and more), while a deterministic game engine resolves the combat, and an AI-compatible model narrates the gritty outcome.

---

## Configuration (.env)

Create a `.env` file in the root directory:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id

# AI Narrator (Optional - Falls back to templates if not provided)
AI_API_KEY=your_openai_compatible_api_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini

# Database File Path (Default: ./data/matches.json)
DATA_PATH=./data/matches.json

# Log Level (debug, info, warn, error)
LOG_LEVEL=info
```

---

##  How to Play

1. Run the `/game` slash command in a channel.
   * *Optional options:* `language` (en, tr, de) and `required_role` (to restrict entries).
2. Players click **Join** to enter the lobby.
3. The lobby creator (who ran `/game`) clicks **Start Game** to begin.
4. Active players receive turn DMs from the bot. Use actions, items, and survive until one remains!

---

## Development

### 1. Installation
```bash
npm install
```

### 2. Run in Development
Runs the bot locally with auto-reload:
```bash
npm run dev
```

### 3. Build & Run in Production
Compiles the TypeScript source files and starts the application:
```bash
npm run build
npm start
```
