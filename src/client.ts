import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { BotCommand } from './types/discord.js';

/**
 * Creates and configures the Discord client with all required intents.
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Channel,   // Required for DMs
      Partials.Message,
    ],
  });

  // Attach command collection to the client
  (client as ExtendedClient).commands = new Collection();

  return client;
}

/**
 * Extended Discord client with a commands collection.
 */
export interface ExtendedClient extends Client {
  commands: Collection<string, BotCommand>;
}
