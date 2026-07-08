/**
 * Shared game-related types used across layers.
 */

/**
 * Match record stored in the database.
 */
export interface MatchRecord {
  matchId: string;
  guildId: string;
  channelId: string;
  winnerId: string | null;
  winnerName: string | null;
  playerCount: number;
  roundCount: number;
  seed: number;
  startedAt: number;
  endedAt: number;
  /** Full game state for replay */
  fullState: any;
}

/**
 * Summary of a match for listing purposes.
 */
export interface MatchSummary {
  matchId: string;
  guildId: string;
  channelId: string;
  winnerId: string | null;
  winnerName: string | null;
  playerCount: number;
  roundCount: number;
  startedAt: number;
  endedAt: number;
}

/**
 * Context passed to the narrator for generating narration.
 */
export interface NarrationContext {
  roundNumber: number;
  result: import('../game/models/RoundResult.js').RoundResult;
  alivePlayers: import('../game/models/Player.js').Player[];
  deadPlayers: import('../game/models/Player.js').Player[];
  allPlayers: import('../game/models/Player.js').Player[];
  history: string[];
  language: string;
}
