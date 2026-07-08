import { ChatInputCommandInteraction, Client } from 'discord.js';
import { GameSession } from './GameSession.js';
import { Narrator } from '../narrator/Narrator.js';
import { AINarrator } from '../narrator/AINarrator.js';
import { FallbackNarrator } from '../narrator/FallbackNarrator.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { JsonStorage } from '../storage/JsonStorage.js';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SessionManager');

/**
 * Tracks all active game sessions across all channels.
 * Enforces the one-game-per-channel rule.
 *
 * Singleton — accessed via getSessionManager().
 */
export class SessionManager {
  /** Active sessions keyed by channel ID */
  private sessions: Map<string, GameSession> = new Map();

  /** Reverse lookup: player ID → channel ID (for DM interaction routing) */
  private playerSessions: Map<string, string> = new Map();

  private narrator: Narrator;
  private storage: StorageProvider;

  constructor(private client: Client) {
    // Initialize narrator
    const config = getConfig();
    if (config.aiApiKey) {
      this.narrator = new AINarrator(config.aiApiKey, config.aiBaseUrl, config.aiModel);
      log.info(`Using AI Narrator (model: ${config.aiModel}, endpoint: ${config.aiBaseUrl})`);
    } else {
      this.narrator = new FallbackNarrator();
      log.info('Using Fallback Narrator (no AI_API_KEY configured)');
    }

    // Initialize JSON storage
    this.storage = new JsonStorage(config.dataPath);
    this.initStorage().catch(err => {
      log.warn('JSON storage initialization failed — match records will be lost', err);
    });
  }

  private async initStorage(): Promise<void> {
    try {
      await (this.storage as JsonStorage).initialize();
      log.info('JSON storage initialized');

      // Wait for the Discord client to be fully connected before resuming sessions.
      // Without this, channels.fetch() and users.fetch() fail because the gateway
      // hasn't connected yet, causing resumed games to lose channel message posting.
      await this.waitForReady();
      await this.loadActiveSessions();
    } catch (error) {
      log.warn('Storage initialization failed', error);
    }
  }

  /**
   * Returns a promise that resolves once the Discord client is ready.
   * If the client is already ready, resolves immediately.
   */
  private waitForReady(): Promise<void> {
    if (this.client.isReady()) return Promise.resolve();
    return new Promise((resolve) => {
      this.client.once('ready', () => resolve());
    });
  }

  private async loadActiveSessions(): Promise<void> {
    try {
      const activeStates = await this.storage.listActiveSessions();
      if (activeStates.length === 0) return;

      log.info(`Found ${activeStates.length} active sessions in database — resuming...`);
      for (const state of activeStates) {
        try {
          const session = GameSession.fromState(this.client, state, this.narrator, this.storage);
          this.sessions.set(state.channelId, session);
          // Resume channel and event loop asynchronously
          session.resume().catch(err => {
            log.error(`Failed to resume session ${state.matchId}`, err);
          });
        } catch (err) {
          log.error(`Failed to reconstruct session ${state.matchId}`, err);
        }
      }
    } catch (error) {
      log.error('Failed to load active sessions from database', error);
    }
  }

  /**
   * Creates a new game session in a channel.
   */
  async createSession(
    channelId: string,
    guildId: string,
    language: string,
    interaction: ChatInputCommandInteraction,
    requiredRoleId: string | null = null,
    creatorId: string = '',
  ): Promise<GameSession> {
    if (this.sessions.has(channelId)) {
      throw new Error('A game is already running in this channel.');
    }

    const session = new GameSession(
      this.client,
      channelId,
      guildId,
      language,
      this.narrator,
      this.storage,
      requiredRoleId,
      creatorId,
    );

    this.sessions.set(channelId, session);

    // Initialize the lobby (sends the lobby message)
    await session.initLobby(interaction);

    // Save newly created active session state to the database
    await session.saveActiveState();

    log.info(`Session created in channel ${channelId}`);
    return session;
  }

  /**
   * Gets a session by channel ID.
   */
  getSession(channelId: string): GameSession | undefined {
    return this.sessions.get(channelId);
  }

  /**
   * Checks if a session exists in a channel.
   */
  hasSession(channelId: string): boolean {
    return this.sessions.has(channelId);
  }

  /**
   * Finds the session a player is currently in.
   * Used for routing DM interactions back to the correct game.
   */
  getSessionByPlayer(playerId: string): GameSession | undefined {
    // Search all sessions for the player
    for (const session of this.sessions.values()) {
      if (session.hasPlayer(playerId)) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Ends and removes a session.
   */
  endSession(channelId: string): void {
    const session = this.sessions.get(channelId);
    if (session) {
      // Remove player lookups
      const players = session.getState().players;
      for (const playerId of players.keys()) {
        this.playerSessions.delete(playerId);
      }

      this.sessions.delete(channelId);
      log.info(`Session ended in channel ${channelId}`);
    }
  }

  /**
   * Returns the count of active sessions.
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

// ── Singleton ──────────────────────────────────────────

let _instance: SessionManager | null = null;

/**
 * Initializes the singleton SessionManager.
 * Must be called once during bot startup.
 */
export function initSessionManager(client: Client): SessionManager {
  _instance = new SessionManager(client);
  return _instance;
}

/**
 * Returns the singleton SessionManager.
 * Throws if not yet initialized.
 */
export function getSessionManager(): SessionManager {
  if (!_instance) {
    throw new Error('SessionManager not initialized. Call initSessionManager() first.');
  }
  return _instance;
}
