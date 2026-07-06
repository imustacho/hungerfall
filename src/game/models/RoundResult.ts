/**
 * Structured result of a single round, produced by the game engine.
 * This is the primary input for the narrator and the round summary renderer.
 */
export interface RoundResult {
  /** Round number */
  roundNumber: number;
  /** All events that occurred this round, in order */
  events: GameEvent[];
  /** Player IDs who died this round */
  deaths: string[];
  /** HP changes per player: { playerId: delta } */
  hpChanges: Map<string, number>;
  /** Items gained/lost per player */
  itemChanges: ItemChange[];
  /** Status effects applied this round */
  statusChanges: StatusChange[];
  /** Player IDs who were selected to act */
  selectedPlayers: string[];
  /** Number of alive players after this round */
  aliveCount: number;
}

/**
 * A single game event within a round.
 * Discriminated union — each event has a unique `type`.
 */
export type GameEvent =
  | DamageEvent
  | DeathEvent
  | HealEvent
  | ItemFoundEvent
  | ItemUsedEvent
  | StatusAppliedEvent
  | StatusExpiredEvent
  | DefendEvent
  | HideEvent
  | MoveEvent
  | HelpEvent
  | BetrayEvent
  | EvasionEvent
  | StatusDamageEvent;

export interface DamageEvent {
  type: 'damage';
  attackerId: string;
  targetId: string;
  amount: number;
  /** Whether the target was defending */
  wasDefending: boolean;
}

export interface DeathEvent {
  type: 'death';
  playerId: string;
  killerId: string | null;
  cause: string;
}

export interface HealEvent {
  type: 'heal';
  playerId: string;
  amount: number;
  /** Actual HP restored (may be less than amount if near max) */
  actualAmount: number;
}

export interface ItemFoundEvent {
  type: 'item_found';
  playerId: string;
  itemName: string;
  itemType: string;
}

export interface ItemUsedEvent {
  type: 'item_used';
  playerId: string;
  itemName: string;
}

export interface StatusAppliedEvent {
  type: 'status_applied';
  playerId: string;
  statusType: string;
  duration: number;
  sourcePlayerId: string | null;
}

export interface StatusExpiredEvent {
  type: 'status_expired';
  playerId: string;
  statusType: string;
}

export interface StatusDamageEvent {
  type: 'status_damage';
  playerId: string;
  statusType: string;
  amount: number;
}

export interface DefendEvent {
  type: 'defend';
  playerId: string;
}

export interface HideEvent {
  type: 'hide';
  playerId: string;
}

export interface MoveEvent {
  type: 'move';
  playerId: string;
}

export interface HelpEvent {
  type: 'help';
  playerId: string;
  targetId: string;
}

export interface BetrayEvent {
  type: 'betray';
  playerId: string;
  targetId: string;
  damage: number;
}

export interface EvasionEvent {
  type: 'evasion';
  attackerId: string;
  targetId: string;
  reason: 'hidden' | 'moved';
}

/**
 * Creates an empty round result.
 */
export function createRoundResult(roundNumber: number, selectedPlayers: string[]): RoundResult {
  return {
    roundNumber,
    events: [],
    deaths: [],
    hpChanges: new Map(),
    itemChanges: [],
    statusChanges: [],
    selectedPlayers,
    aliveCount: 0,
  };
}

export interface ItemChange {
  playerId: string;
  itemName: string;
  action: 'gained' | 'lost' | 'used';
}

export interface StatusChange {
  playerId: string;
  statusType: string;
  action: 'applied' | 'expired' | 'ticked';
}
