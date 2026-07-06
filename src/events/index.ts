import { ExtendedClient } from '../client.js';
import { registerReadyEvent } from './ready.js';
import { registerInteractionEvent } from './interactionCreate.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Events');

/**
 * Registers all Discord event handlers on the client.
 */
export function registerEvents(client: ExtendedClient): void {
  registerReadyEvent(client);
  registerInteractionEvent(client);
  log.info('All events registered');
}
