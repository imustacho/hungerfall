import { Item } from './Item.js';
import { StatusEffect } from './StatusEffect.js';

/**
 * Represents a player within a match.
 * This model is Discord-agnostic — it uses user IDs but has no Discord imports.
 */
export interface Player {
  /** Discord user ID */
  readonly id: string;
  /** Discord display name at time of joining */
  username: string;

  // ── Vitals ──────────────────────────────────────────
  hp: number;
  maxHp: number;
  alive: boolean;

  // ── Inventory & Status ──────────────────────────────
  inventory: Item[];
  statusEffects: StatusEffect[];

  // ── Team ────────────────────────────────────────────
  teamId: string | null;

  // ── Stats (accumulated over the match) ──────────────
  kills: number;
  damageDealt: number;
  damageReceived: number;
  roundsSurvived: number;
  actionsPerformed: number;

  // ── Round tracking ──────────────────────────────────
  /** Number of rounds since this player was last selected for action */
  roundsSinceLastAction: number;
  /** Whether this player was selected to act in the current round */
  selectedThisRound: boolean;

  // ── Extensible metadata ─────────────────────────────
  /** Freeform metadata for future extensions */
  metadata: Record<string, unknown>;
}

/**
 * Creates a new player with default values.
 */
export function createPlayer(id: string, username: string, maxHp: number): Player {
  return {
    id,
    username,
    hp: maxHp,
    maxHp,
    alive: true,
    inventory: [],
    statusEffects: [],
    teamId: null,
    kills: 0,
    damageDealt: 0,
    damageReceived: 0,
    roundsSurvived: 0,
    actionsPerformed: 0,
    roundsSinceLastAction: 0,
    selectedThisRound: false,
    metadata: {},
  };
}

/**
 * Returns a deep clone of a player (for immutable state transitions).
 */
export function clonePlayer(player: Player): Player {
  return {
    ...player,
    inventory: player.inventory.map(item => ({ ...item })),
    statusEffects: player.statusEffects.map(effect => ({ ...effect })),
    metadata: { ...player.metadata },
  };
}
