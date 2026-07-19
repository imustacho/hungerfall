import { ItemTemplate } from './models/Item.js';

/**
 * All game balance constants in one place.
 * Tuning the game is as easy as changing values here.
 */
export const GAME_CONSTANTS = {
  // ── Player defaults ─────────────────────────────────
  /** Base maximum HP for all players */
  BASE_MAX_HP: 100,

  // ── Lobby ───────────────────────────────────────────
  /** Minimum number of players to start */
  MIN_PLAYERS: 2,
  /** Maximum number of players allowed */
  MAX_PLAYERS: 16,
  /** Maximum team size */
  MAX_TEAM_SIZE: 2,

  // ── Round ───────────────────────────────────────────
  /** Ratio of alive players selected per round (0-1) */
  SELECTION_RATIO: 0.75,
  /** Minimum number of players selected per round */
  MIN_SELECTED: 3,
  /** Time in milliseconds for players to respond to DMs */
  ACTION_TIMEOUT_MS: 60_000,

  // ── Combat ──────────────────────────────────────────
  /** Base attack damage range — increased significantly for faster games */
  BASE_DAMAGE_MIN: 40,
  BASE_DAMAGE_MAX: 70,
  /** Defend damage reduction multiplier (0.35 = defend absorbs 65%) */
  DEFEND_REDUCTION: 0.35,
  /** Betray damage multiplier (surprise attack bonus) */
  BETRAY_MULTIPLIER: 1.8,
  /** Maximum damage that can be dealt in a single attack (hard cap) */
  MAX_DAMAGE_CAP: 60,
  /** Help teammate strength boost intensity */
  HELP_BOOST_INTENSITY: 20,
  /** Help teammate strength boost duration in rounds */
  HELP_BOOST_DURATION: 2,

  // ── Healing ─────────────────────────────────────────
  /** Base heal amount — slightly reduced so healing doesn't drag the match */
  BASE_HEAL_AMOUNT: 20,

  // ── Evasion ─────────────────────────────────────────
  /** Chance to evade an attack while hidden — reduced so attacks land more often */
  HIDE_EVASION_CHANCE: 0.4,
  /** Chance to evade an attack after moving — reduced so attacks land more often */
  MOVE_EVASION_CHANCE: 0.2,

  // ── Status Effects ──────────────────────────────────
  /** Damage per round from bleeding — increased for lethality */
  BLEED_DAMAGE: 18,
  /** Damage per round from poison — increased for lethality */
  POISON_DAMAGE: 22,
  /** HP restored per round from regeneration */
  REGEN_HEAL: 8,
  /** Default duration for hide status (rounds) */
  HIDE_DURATION: 1,
  /** Default duration for defend status (rounds) */
  DEFEND_DURATION: 1,
  /** Duration for move evasion bonus */
  MOVE_EVASION_DURATION: 1,

  // ── Items ───────────────────────────────────────────
  /** Chance to find an item when searching (0-1) */
  SEARCH_FIND_CHANCE: 0.8,
  /** Chance to find a second item (0-1) */
  SEARCH_BONUS_CHANCE: 0.2,
  /** Max inventory size */
  MAX_INVENTORY_SIZE: 5,
} as const;

/**
 * Loot table — all items that can be found when searching.
 * Weight determines relative spawn probability.
 */
export const ITEM_TEMPLATES: ItemTemplate[] = [
  // ── Weapons ─────────────────────────────────────────
  {
    name: 'Rusty Knife',
    type: 'weapon',
    effect: { type: 'damage_bonus', value: 12 },
    durability: 5,
    description: 'A dull blade. Better than nothing.',
    weight: 25,
  },
  {
    name: 'Hunting Bow',
    type: 'weapon',
    effect: { type: 'damage_bonus', value: 18 },
    durability: 4,
    description: 'A worn bow with a few arrows remaining.',
    weight: 18,
  },
  {
    name: 'Battle Axe',
    type: 'weapon',
    effect: { type: 'damage_bonus', value: 25 },
    durability: 3,
    description: 'A heavy axe that packs a devastating punch.',
    weight: 10,
  },
  {
    name: 'Poisoned Dagger',
    type: 'weapon',
    effect: { type: 'poison_attack', value: 4 },
    durability: 3,
    description: 'A blade coated in a sickly green substance.',
    weight: 8,
  },
  {
    name: 'Throwing Spear',
    type: 'weapon',
    effect: { type: 'damage_bonus', value: 30 },
    durability: 2,
    description: 'A weighted spear, devastating on a single throw.',
    weight: 6,
  },
  {
    name: 'Explosive Trap',
    type: 'weapon',
    effect: { type: 'damage_bonus', value: 45 },
    durability: 1,
    description: 'A rigged contraption. Use once — devastating blast.',
    weight: 3,
  },
  {
    name: 'Crossbow',
    type: 'weapon',
    effect: { type: 'damage_bonus', value: 22 },
    durability: 5,
    description: 'A reliable ranged weapon with bolts to spare.',
    weight: 10,
  },

  // ── Armor ───────────────────────────────────────────
  {
    name: 'Leather Vest',
    type: 'armor',
    effect: { type: 'defense_bonus', value: 8 },
    durability: -1,
    description: 'A sturdy leather vest that absorbs some damage.',
    weight: 18,
  },
  {
    name: 'Iron Shield',
    type: 'armor',
    effect: { type: 'defense_bonus', value: 15 },
    durability: 4,
    description: 'A battered but functional shield.',
    weight: 10,
  },
  {
    name: 'Chain Mail',
    type: 'armor',
    effect: { type: 'defense_bonus', value: 20 },
    durability: -1,
    description: 'Heavy interlinked rings that deflect blade and arrow alike.',
    weight: 5,
  },

  // ── Consumables ─────────────────────────────────────
  {
    name: 'Healing Herbs',
    type: 'consumable',
    effect: { type: 'heal', value: 25 },
    durability: 1,
    description: 'A bundle of medicinal herbs.',
    weight: 20,
  },
  {
    name: 'Bandages',
    type: 'consumable',
    effect: { type: 'heal', value: 15 },
    durability: 2,
    description: 'Clean cloth bandages for treating wounds.',
    weight: 25,
  },
  {
    name: 'Full Medkit',
    type: 'consumable',
    effect: { type: 'heal', value: 40 },
    durability: 1,
    description: 'A stocked medical kit. Restores a large chunk of HP.',
    weight: 5,
  },
  {
    name: 'Adrenaline Shot',
    type: 'consumable',
    effect: { type: 'max_hp_bonus', value: 20 },
    durability: 1,
    description: 'A surge of energy. Permanently increases max HP.',
    weight: 5,
  },
  {
    name: 'Antidote',
    type: 'consumable',
    effect: { type: 'heal', value: 15 },
    durability: 1,
    description: 'Clears poison and restores a little HP.',
    weight: 10,
  },

  // ── Special ─────────────────────────────────────────
  {
    name: 'Shadow Cloak',
    type: 'special',
    effect: { type: 'evasion_bonus', value: 20 },
    durability: -1,
    description: 'A tattered cloak that helps you blend into the shadows.',
    weight: 5,
  },
  {
    name: 'Ghost Veil',
    type: 'special',
    effect: { type: 'evasion_bonus', value: 30 },
    durability: 3,
    description: 'An enchanted veil that makes you nearly invisible.',
    weight: 2,
  },
];
