import { Player } from '../models/Player.js';
import { GameState } from '../models/GameState.js';
import { DamageEvent, EvasionEvent } from '../models/RoundResult.js';
import { GAME_CONSTANTS } from '../constants.js';
import { SeededRNG, clamp } from '../../utils/helpers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('CombatSystem');

export interface CombatResult {
  damageEvents: DamageEvent[];
  evasionEvents: EvasionEvent[];
}

/**
 * Handles all combat calculations: damage, defense, evasion, and item modifiers.
 * Completely deterministic — all randomness flows through the seeded RNG.
 */
export class CombatSystem {
  /**
   * Calculates damage from an attacker to a target.
   * Returns the damage events and any evasion events.
   */
  resolveAttack(
    attacker: Player,
    target: Player,
    state: GameState,
    rng: SeededRNG,
    isBetray: boolean = false,
  ): CombatResult {
    const events: DamageEvent[] = [];
    const evasionEvents: EvasionEvent[] = [];

    // ── Check evasion ─────────────────────────────────
    const isHidden = target.statusEffects.some(e => e.type === 'hidden');
    const hasMoved = target.metadata['moved'] === true;

    if (isHidden) {
      const evasionChance = GAME_CONSTANTS.HIDE_EVASION_CHANCE +
        this.getEvasionBonus(target);

      if (rng.chance(evasionChance)) {
        evasionEvents.push({
          type: 'evasion',
          attackerId: attacker.id,
          targetId: target.id,
          reason: 'hidden',
        });
        log.debug(`${target.username} evaded attack from ${attacker.username} (hidden)`);
        return { damageEvents: events, evasionEvents };
      }
    }

    if (hasMoved) {
      const moveEvasionChance = GAME_CONSTANTS.MOVE_EVASION_CHANCE +
        this.getEvasionBonus(target);

      if (rng.chance(moveEvasionChance)) {
        evasionEvents.push({
          type: 'evasion',
          attackerId: attacker.id,
          targetId: target.id,
          reason: 'moved',
        });
        log.debug(`${target.username} evaded attack from ${attacker.username} (moved)`);
        return { damageEvents: events, evasionEvents };
      }
    }

    // ── Calculate base damage ─────────────────────────
    let damage = rng.nextInt(GAME_CONSTANTS.BASE_DAMAGE_MIN, GAME_CONSTANTS.BASE_DAMAGE_MAX);

    // Apply weapon bonuses
    damage += this.getAttackBonus(attacker);

    // Apply strength buff
    const strengthBuff = attacker.statusEffects.find(e => e.type === 'strengthened');
    if (strengthBuff) {
      damage += strengthBuff.intensity;
    }

    // Apply weakness debuff
    const weakDebuff = attacker.statusEffects.find(e => e.type === 'weakened');
    if (weakDebuff) {
      damage = Math.max(1, damage - weakDebuff.intensity);
    }

    // Betray multiplier (surprise attack)
    if (isBetray) {
      damage = Math.floor(damage * GAME_CONSTANTS.BETRAY_MULTIPLIER);
    }

    // ── Apply defense ─────────────────────────────────
    const isDefending = target.statusEffects.some(e => e.type === 'defended');

    if (isDefending) {
      damage = Math.floor(damage * GAME_CONSTANTS.DEFEND_REDUCTION);
    }

    // Apply armor
    damage -= this.getDefenseBonus(target);
    damage = Math.max(1, damage); // Minimum 1 damage

    // Apply hard damage cap
    damage = Math.min(damage, GAME_CONSTANTS.MAX_DAMAGE_CAP);

    events.push({
      type: 'damage',
      attackerId: attacker.id,
      targetId: target.id,
      amount: damage,
      wasDefending: isDefending,
    });

    log.debug(`${attacker.username} dealt ${damage} damage to ${target.username}`);
    return { damageEvents: events, evasionEvents };
  }

  /**
   * Applies damage to a player and updates their stats.
   */
  applyDamage(target: Player, amount: number, attackerId: string | null): void {
    target.hp = clamp(target.hp - amount, 0, target.maxHp);
    target.damageReceived += amount;
  }

  /**
   * Gets total attack bonus from inventory items.
   */
  private getAttackBonus(player: Player): number {
    return player.inventory
      .filter(item => item.effect.type === 'damage_bonus')
      .reduce((sum, item) => sum + item.effect.value, 0);
  }

  /**
   * Gets total defense bonus from inventory items.
   */
  private getDefenseBonus(player: Player): number {
    return player.inventory
      .filter(item => item.effect.type === 'defense_bonus')
      .reduce((sum, item) => sum + item.effect.value, 0);
  }

  /**
   * Gets total evasion bonus from inventory items.
   */
  private getEvasionBonus(player: Player): number {
    return player.inventory
      .filter(item => item.effect.type === 'evasion_bonus')
      .reduce((sum, item) => sum + item.effect.value / 100, 0);
  }
}
