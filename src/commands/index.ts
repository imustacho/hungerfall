import { ExtendedClient } from '../client.js';
import { createLogger } from '../utils/logger.js';
import gameCommand from './game.js';
import { BotCommand } from '../types/discord.js';

const log = createLogger('Commands');

/** All registered commands */
const commands: BotCommand[] = [
  gameCommand,
];

/**
 * Registers all slash commands on the client's command collection.
 */
export function registerCommands(client: ExtendedClient): void {
  for (const command of commands) {
    client.commands.set(command.data.name, command);
    log.info(`Registered command: /${command.data.name}`);
  }
}

/**
 * Returns all command data objects for deployment to Discord.
 */
export function getCommandData() {
  return commands.map(cmd => cmd.data.toJSON());
}
