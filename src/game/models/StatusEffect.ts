/**
 * Represents a status effect currently applied to a player.
 */
export interface StatusEffect {
  /** Effect type identifier */
  type: StatusEffectType;
  /** Remaining rounds before this effect expires */
  duration: number;
  /** Strength/magnitude of the effect */
  intensity: number;
  /** Player ID who caused this effect (for kill attribution) */
  sourcePlayerId: string | null;
}

export type StatusEffectType =
  | 'bleeding'      // Damage over time
  | 'poisoned'      // Damage over time (different flavor)
  | 'hidden'        // High evasion chance, removed on action
  | 'defended'      // Damage reduction, lasts 1 round
  | 'strengthened'  // Damage bonus
  | 'weakened'      // Damage reduction debuff
  | 'regenerating'; // Heal over time

/**
 * Metadata about a status effect type.
 */
export interface StatusEffectDefinition {
  type: StatusEffectType;
  name: string;
  description: string;
  /** Whether this is beneficial (true) or harmful (false) */
  isBuff: boolean;
  /** Whether this stacks or refreshes on reapplication */
  stackable: boolean;
}

export const STATUS_EFFECT_DEFINITIONS: Record<StatusEffectType, StatusEffectDefinition> = {
  bleeding: {
    type: 'bleeding',
    name: 'Bleeding',
    description: 'Losing HP each round from wounds',
    isBuff: false,
    stackable: true,
  },
  poisoned: {
    type: 'poisoned',
    name: 'Poisoned',
    description: 'Taking poison damage each round',
    isBuff: false,
    stackable: false,
  },
  hidden: {
    type: 'hidden',
    name: 'Hidden',
    description: 'Concealed from other players',
    isBuff: true,
    stackable: false,
  },
  defended: {
    type: 'defended',
    name: 'Defended',
    description: 'Bracing for incoming attacks',
    isBuff: true,
    stackable: false,
  },
  strengthened: {
    type: 'strengthened',
    name: 'Strengthened',
    description: 'Dealing extra damage',
    isBuff: true,
    stackable: false,
  },
  weakened: {
    type: 'weakened',
    name: 'Weakened',
    description: 'Dealing reduced damage',
    isBuff: false,
    stackable: false,
  },
  regenerating: {
    type: 'regenerating',
    name: 'Regenerating',
    description: 'Slowly recovering HP',
    isBuff: true,
    stackable: false,
  },
};
