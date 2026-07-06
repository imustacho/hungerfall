/**
 * Represents an item that can be found, used, or held in inventory.
 */
export interface Item {
  /** Unique item instance ID */
  readonly id: string;
  /** Display name */
  name: string;
  /** Item category */
  type: ItemType;
  /** What this item does */
  effect: ItemEffect;
  /** Number of uses remaining (-1 = infinite/passive) */
  durability: number;
  /** Human-readable description */
  description: string;
}

export type ItemType = 'weapon' | 'armor' | 'consumable' | 'special';

export interface ItemEffect {
  /** Type of effect */
  type: ItemEffectType;
  /** Magnitude of the effect */
  value: number;
}

export type ItemEffectType =
  | 'damage_bonus'     // Increases attack damage
  | 'defense_bonus'    // Reduces incoming damage
  | 'heal'             // Restores HP when used
  | 'evasion_bonus'    // Increases hide evasion chance
  | 'poison_attack'    // Adds poison on hit
  | 'max_hp_bonus';    // Increases max HP

/**
 * Definition of an item template used to spawn item instances.
 */
export interface ItemTemplate {
  name: string;
  type: ItemType;
  effect: ItemEffect;
  durability: number;
  description: string;
  /** Relative weight for loot table (higher = more common) */
  weight: number;
}
