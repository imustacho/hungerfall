import { MatchRecord, MatchSummary } from '../types/game.js';

/**
 * Interface for all storage backends.
 * Implementations can be swapped without affecting any other code.
 */
export interface StorageProvider {
  /**
   * Saves a completed match record.
   */
  saveMatch(match: MatchRecord): Promise<void>;

  /**
   * Retrieves a match by its ID.
   */
  getMatch(matchId: string): Promise<MatchRecord | null>;

  /**
   * Lists match summaries for a guild, ordered by most recent.
   */
  listMatches(guildId: string, limit?: number): Promise<MatchSummary[]>;

  /**
   * Saves an active game session state.
   */
  saveActiveSession(state: import('../game/models/GameState.js').GameState): Promise<void>;

  /**
   * Deletes an active game session state (e.g. when finished or cancelled).
   */
  deleteActiveSession(channelId: string): Promise<void>;

  /**
   * Retrieves all active game session states.
   */
  listActiveSessions(): Promise<import('../game/models/GameState.js').GameState[]>;

  /**
   * Initializes the storage backend.
   * Called once during startup.
   */
  initialize(): Promise<void>;

  /**
   * Closes the storage connection gracefully.
   */
  close(): Promise<void>;
}
