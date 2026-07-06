import { Player } from './Player.js';
import { RoundResult } from './RoundResult.js';

/**
 * The phases a game progresses through.
 */
export type GamePhase = 'lobby' | 'active' | 'finished';

/**
 * Complete snapshot of a game's state at any point in time.
 * The engine operates on this immutably — it returns a new state each round.
 */
export interface GameState {
  /** Unique match identifier */
  readonly matchId: string;
  /** Discord channel ID where the game is hosted */
  readonly channelId: string;
  /** Discord guild ID */
  readonly guildId: string;

  /** Selected language for interface and narrator */
  readonly language: string;

  /** Current game phase */
  phase: GamePhase;
  /** Current round number (starts at 1) */
  round: number;
  /** PRNG seed for deterministic randomness */
  readonly seed: number;

  /** All players (including dead ones) */
  players: Map<string, Player>;

  /** History of round results */
  roundHistory: RoundResult[];
  /** History of narrations (for AI context) */
  narrationHistory: string[];

  /** Team counter for generating unique team IDs */
  nextTeamId: number;

  /** Timestamp when the game started */
  startedAt: number | null;
  /** Timestamp when the game ended */
  endedAt: number | null;
  /** Player ID of the winner (null if game is still active) */
  winnerId: string | null;

  /** Optional Discord role ID required to join this game (null = anyone can join) */
  requiredRoleId: string | null;

  /** Discord user ID of the player who created the lobby */
  creatorId: string;

  /** Discord message ID of the lobby message */
  lobbyMessageId: string | null;
}

/**
 * Creates a new game state in the lobby phase.
 */
export function createGameState(
  matchId: string,
  channelId: string,
  guildId: string,
  seed: number,
  language: string,
  requiredRoleId: string | null = null,
  creatorId: string = '',
): GameState {
  return {
    matchId,
    channelId,
    guildId,
    language,
    phase: 'lobby',
    round: 0,
    seed,
    players: new Map(),
    roundHistory: [],
    narrationHistory: [],
    nextTeamId: 1,
    startedAt: null,
    endedAt: null,
    winnerId: null,
    requiredRoleId,
    creatorId,
    lobbyMessageId: null,
  };
}

/**
 * Returns all alive players.
 */
export function getAlivePlayers(state: GameState): Player[] {
  return Array.from(state.players.values()).filter(p => p.alive);
}

/**
 * Returns all dead players.
 */
export function getDeadPlayers(state: GameState): Player[] {
  return Array.from(state.players.values()).filter(p => !p.alive);
}

/**
 * Returns players belonging to a specific team.
 */
export function getTeamPlayers(state: GameState, teamId: string): Player[] {
  return Array.from(state.players.values()).filter(p => p.teamId === teamId);
}
