import { Events } from 'discord.js';
import { createLogger } from '../utils/logger.js';
import { ExtendedClient } from '../client.js';

const log = createLogger('Ready');

/**
 * Handles the 'ready' event — fired when the bot successfully connects to Discord.
 */
export function registerReadyEvent(client: ExtendedClient): void {
  client.once(Events.ClientReady, (readyClient) => {
    log.info(`✅ Hungerfall is online as ${readyClient.user.tag}`);
    log.info(`📡 Serving ${readyClient.guilds.cache.size} guild(s)`);
    log.info(`📋 ${(readyClient as unknown as ExtendedClient).commands.size} command(s) loaded`);
  });
}
