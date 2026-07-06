import { Player } from '../models/Player.js';
import { Item, ItemTemplate } from '../models/Item.js';
import { ItemFoundEvent } from '../models/RoundResult.js';
import { GAME_CONSTANTS, ITEM_TEMPLATES } from '../constants.js';
import { SeededRNG } from '../../utils/helpers.js';
import { createLogger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('ItemSystem');

/**
 * Handles item generation, loot tables, and inventory management.
 */
export class ItemSystem {
  /**
   * Attempts to find items for a player performing the 'search' action.
   */
  search(player: Player, rng: SeededRNG): ItemFoundEvent[] {
    const events: ItemFoundEvent[] = [];

    if (!rng.chance(GAME_CONSTANTS.SEARCH_FIND_CHANCE)) {
      log.debug(`${player.username} searched but found nothing`);
      return events;
    }

    // Find first item
    const item = this.generateItem(rng);
    if (this.addToInventory(player, item)) {
      events.push({
        type: 'item_found',
        playerId: player.id,
        itemName: item.name,
        itemType: item.type,
      });
      log.debug(`${player.username} found: ${item.name}`);
    }

    // Small chance for a bonus item
    if (rng.chance(GAME_CONSTANTS.SEARCH_BONUS_CHANCE)) {
      const bonusItem = this.generateItem(rng);
      if (this.addToInventory(player, bonusItem)) {
        events.push({
          type: 'item_found',
          playerId: player.id,
          itemName: bonusItem.name,
          itemType: bonusItem.type,
        });
        log.debug(`${player.username} found bonus item: ${bonusItem.name}`);
      }
    }

    return events;
  }

  /**
   * Generates a random item from the loot table using weighted selection.
   */
  generateItem(rng: SeededRNG): Item {
    const template = this.selectTemplate(rng);
    return this.instantiateItem(template);
  }

  /**
   * Selects an item template from the loot table using weighted random selection.
   */
  private selectTemplate(rng: SeededRNG): ItemTemplate {
    const totalWeight = ITEM_TEMPLATES.reduce((sum, t) => sum + t.weight, 0);
    let roll = rng.nextFloat(0, totalWeight);

    for (const template of ITEM_TEMPLATES) {
      roll -= template.weight;
      if (roll <= 0) {
        return template;
      }
    }

    // Fallback to last item (shouldn't happen)
    return ITEM_TEMPLATES[ITEM_TEMPLATES.length - 1];
  }

  /**
   * Creates an item instance from a template.
   */
  private instantiateItem(template: ItemTemplate): Item {
    return {
      id: uuidv4(),
      name: template.name,
      type: template.type,
      effect: { ...template.effect },
      durability: template.durability,
      description: template.description,
    };
  }

  /**
   * Adds an item to a player's inventory if there's space.
   * Returns true if added, false if inventory is full.
   */
  addToInventory(player: Player, item: Item): boolean {
    if (player.inventory.length >= GAME_CONSTANTS.MAX_INVENTORY_SIZE) {
      log.debug(`${player.username}'s inventory is full — cannot add ${item.name}`);
      return false;
    }
    player.inventory.push(item);
    return true;
  }

  /**
   * Uses a consumable item from the player's inventory.
   * Returns the item if found and consumed, null otherwise.
   */
  useConsumable(player: Player, itemId: string): Item | null {
    const index = player.inventory.findIndex(i => i.id === itemId && i.type === 'consumable');
    if (index === -1) return null;

    const item = player.inventory[index];
    item.durability--;

    if (item.durability <= 0) {
      player.inventory.splice(index, 1);
    }

    return item;
  }

  /**
   * Decrements durability on used weapons/armor.
   * Removes items that have broken.
   */
  tickDurability(player: Player, usedItemTypes: Set<string>): void {
    player.inventory = player.inventory.filter(item => {
      if (item.durability === -1) return true; // Infinite durability
      if (usedItemTypes.has(item.effect.type)) {
        item.durability--;
        if (item.durability <= 0) {
          log.debug(`${player.username}'s ${item.name} broke!`);
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Allows a player to manually use an item from their inventory.
   * Consumables are applied immediately and removed.
   * Weapons/armor/special items are passive and can't be "used" directly.
   *
   * Returns a human-readable effect description, or null if invalid.
   */
  useItem(player: Player, itemId: string): { effectDesc: string; itemName: string } | null {
    const item = player.inventory.find(i => i.id === itemId);
    if (!item) return null;

    switch (item.effect.type) {
      // ── Consumables ─────────────────────────────────
      case 'heal': {
        const actualHeal = Math.min(item.effect.value, player.maxHp - player.hp);
        player.hp = Math.min(player.hp + item.effect.value, player.maxHp);
        this.consumeItem(player, itemId);
        return {
          itemName: item.name,
          effectDesc: `+**${actualHeal} HP** restored (${player.hp}/${player.maxHp})`,
        };
      }
      case 'max_hp_bonus': {
        player.maxHp += item.effect.value;
        player.hp = Math.min(player.hp + item.effect.value, player.maxHp);
        this.consumeItem(player, itemId);
        return {
          itemName: item.name,
          effectDesc: `Max HP +**${item.effect.value}** → now **${player.maxHp}**`,
        };
      }
      // ── Weapons: active strike boost ─────────────────
      case 'damage_bonus': {
        this.applyStatusToPlayer(player, 'strengthened', 1, item.effect.value);
        this.consumeItem(player, itemId);
        return {
          itemName: item.name,
          effectDesc: `⚔️ **Empowered** — next attack deals +${item.effect.value} damage this round!`,
        };
      }
      // ── Armor: defensive brace ────────────────────────
      case 'defense_bonus': {
        this.applyStatusToPlayer(player, 'defended', 1, item.effect.value);
        this.consumeItem(player, itemId);
        return {
          itemName: item.name,
          effectDesc: `🛡️ **Fortified** — you brace for impact, reducing incoming damage this round!`,
        };
      }
      // ── Special: evasion cloak ────────────────────────
      case 'evasion_bonus': {
        this.applyStatusToPlayer(player, 'hidden', 1, item.effect.value);
        this.consumeItem(player, itemId);
        return {
          itemName: item.name,
          effectDesc: `✨ **Cloaked** — +${item.effect.value}% evasion chance this round!`,
        };
      }
      // ── Poison weapons: already passive ───────────────
      case 'poison_attack': {
        return {
          itemName: item.name,
          effectDesc: `☠️ This weapon already coats your attacks with poison automatically — no activation needed.`,
        };
      }
      default:
        return null;
    }
  }

  /**
   * Applies a status effect directly to a player for item-triggered effects.
   */
  private applyStatusToPlayer(
    player: Player,
    type: import('../models/StatusEffect.js').StatusEffectType,
    duration: number,
    intensity: number,
  ): void {
    const existing = player.statusEffects.find(e => e.type === type);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.intensity = Math.max(existing.intensity, intensity);
    } else {
      player.statusEffects.push({ type, duration, intensity, sourcePlayerId: null });
    }
    log.debug(`Item: applied ${type} (${duration}r, x${intensity}) to ${player.username}`);
  }

  /**
   * Removes one use of an item, deleting it if durability hits 0.
   */
  private consumeItem(player: Player, itemId: string): void {
    const index = player.inventory.findIndex(i => i.id === itemId);
    if (index === -1) return;

    const item = player.inventory[index];
    if (item.durability === -1) return; // Infinite — don't remove

    item.durability--;
    if (item.durability <= 0) {
      player.inventory.splice(index, 1);
      log.debug(`${player.username} consumed ${item.name} (used up)`);
    }
  }
}
