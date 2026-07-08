import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  /** Discord bot token */
  discordToken: string;
  /** Discord application client ID */
  clientId: string;
  /** Guild ID for development command registration (empty = global) */
  guildId: string;
  /** API key for the AI narrator (any OpenAI-compatible provider) */
  aiApiKey: string;
  /** Base URL for the AI API (e.g. https://api.openai.com/v1, http://localhost:11434/v1) */
  aiBaseUrl: string;
  /** Model name to use for narration (e.g. gpt-4o-mini, llama3, gemini-2.0-flash) */
  aiModel: string;
  /** MongoDB connection URI */
  mongoUri: string;
  /** Logging level */
  logLevel: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, fallback: string): string {
  const value = process.env[key];
  return value ? value.trim() : fallback;
}

export function loadConfig(): AppConfig {
  return {
    discordToken: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
    guildId: optionalEnv('GUILD_ID', ''),
    aiApiKey: optionalEnv('AI_API_KEY', ''),
    aiBaseUrl: optionalEnv('AI_BASE_URL', 'https://api.openai.com/v1'),
    aiModel: optionalEnv('AI_MODEL', 'gpt-4o-mini'),
    mongoUri: optionalEnv('MONGO_URI', 'mongodb://localhost:27017/hungerfall'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
  };
}

/** Singleton config instance — initialized lazily */
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
