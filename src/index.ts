import { createClient, ExtendedClient } from './client.js';
import { registerCommands } from './commands/index.js';
import { registerEvents } from './events/index.js';
import { initSessionManager } from './session/SessionManager.js';
import { getConfig } from './config.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('Main');

async function main(): Promise<void> {
  log.info('🎮 Hungerfall is starting up...');

  // Load and validate configuration
  const config = getConfig();
  log.info('Configuration loaded');

  // Create Discord client
  const client = createClient() as ExtendedClient;

  // Register commands
  registerCommands(client);

  // Register event handlers
  registerEvents(client);

  // Initialize session manager (creates narrator + storage)
  initSessionManager(client);
  log.info('Session manager initialized');

  // Login to Discord
  await client.login(config.discordToken);

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
