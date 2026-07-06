import { Player } from '../models/Player.js';
import { GameState, getAlivePlayers } from '../models/GameState.js';
import { Action } from '../models/Action.js';
import {
  GameEvent,
  DefendEvent,
  HideEvent,
  MoveEvent,
  HealEvent,
  HelpEvent,
  BetrayEvent,
} from '../models/RoundResult.js';
import { GAME_CONSTANTS } from '../constants.js';
import { CombatSystem } from './CombatSystem.js';
import { ItemSystem } from './ItemSystem.js';
import { StatusSystem } from './StatusSystem.js';
import { SeededRNG, clamp } from '../../utils/helpers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ActionResolver');

/**
 * Resolves player actions into game events.
 * This is the core logic that translates player decisions into game outcomes.
 */
export class ActionResolver {
  constructor(
    private combat: CombatSystem,
    private items: ItemSystem,
    private status: StatusSystem,
  ) {}

  /**
   * Resolves all player actions for a round.
   * Returns ordered events and applies state changes to players.
   */
  resolveActions(
    state: GameState,
    actions: Map<string, Action>,
    rng: SeededRNG,
  ): GameEvent[] {
    const events: GameEvent[] = [];

    // Group actions by priority:
    // 1. Defensive actions first (defend, hide, move)
    // 2. Supportive actions (heal, help, search)
    // 3. Offensive actions (attack, betray)
    const defensive: Array<[string, Action]> = [];
    const supportive: Array<[string, Action]> = [];
    const offensive: Array<[string, Action]> = [];

    for (const [playerId, action] of actions) {
      const player = state.players.get(playerId);
      if (!player || !player.alive) continue;

      switch (action.type) {
        case 'defend':
        case 'hide':
        case 'move':
          defensive.push([playerId, action]);
          break;
        case 'heal':
        case 'help_teammate':
        case 'search':
          supportive.push([playerId, action]);
          break;
        case 'attack':
        case 'betray_teammate':
          offensive.push([playerId, action]);
          break;
      }
    }

    // Resolve in priority order
    for (const [playerId, action] of defensive) {
      const playerEvents = this.resolveDefensiveAction(state, playerId, action, rng);
      events.push(...playerEvents);
    }

    for (const [playerId, action] of supportive) {
      const playerEvents = this.resolveSupportiveAction(state, playerId, action, rng);
      events.push(...playerEvents);
    }

    for (const [playerId, action] of offensive) {
      const playerEvents = this.resolveOffensiveAction(state, playerId, action, rng);
      events.push(...playerEvents);
    }

    return events;
  }

  private resolveDefensiveAction(
    state: GameState,
    playerId: string,
    action: Action,
    rng: SeededRNG,
  ): GameEvent[] {
    const player = state.players.get(playerId)!;
    const events: GameEvent[] = [];

    switch (action.type) {
      case 'defend': {
        this.status.apply(player, 'defended', GAME_CONSTANTS.DEFEND_DURATION);
        events.push({ type: 'defend', playerId } satisfies DefendEvent);
        player.actionsPerformed++;
        break;
      }
      case 'hide': {
        this.status.apply(player, 'hidden', GAME_CONSTANTS.HIDE_DURATION);
        events.push({ type: 'hide', playerId } satisfies HideEvent);
        player.actionsPerformed++;
        break;
      }
      case 'move': {
        // Moving gives a chance to evade attacks
        player.metadata['moved'] = true;
        events.push({ type: 'move', playerId } satisfies MoveEvent);
        player.actionsPerformed++;
        break;
      }
    }

    return events;
  }

  private resolveSupportiveAction(
    state: GameState,
    playerId: string,
    action: Action,
    rng: SeededRNG,
  ): GameEvent[] {
    const player = state.players.get(playerId)!;
    const events: GameEvent[] = [];

    switch (action.type) {
      case 'heal': {
        const healAmount = GAME_CONSTANTS.BASE_HEAL_AMOUNT;
        const actualHeal = Math.min(healAmount, player.maxHp - player.hp);
        player.hp = clamp(player.hp + actualHeal, 0, player.maxHp);

        events.push({
          type: 'heal',
          playerId,
          amount: healAmount,
          actualAmount: actualHeal,
        } satisfies HealEvent);
        player.actionsPerformed++;
        break;
      }
      case 'help_teammate': {
        if (action.type !== 'help_teammate') break;
        const teammate = state.players.get(action.targetId);
        if (!teammate || !teammate.alive || teammate.teamId !== player.teamId) {
          // Invalid target — treat as defend
          this.status.apply(player, 'defended', GAME_CONSTANTS.DEFEND_DURATION);
          events.push({ type: 'defend', playerId } satisfies DefendEvent);
          break;
        }

        // Boost teammate's strength
        const statusEvent = this.status.apply(
          teammate,
          'strengthened',
          GAME_CONSTANTS.HELP_BOOST_DURATION,
          GAME_CONSTANTS.HELP_BOOST_INTENSITY,
          playerId,
        );
        events.push(statusEvent);
        events.push({
          type: 'help',
          playerId,
          targetId: action.targetId,
        } satisfies HelpEvent);
        player.actionsPerformed++;
        break;
      }
      case 'search': {
        const foundEvents = this.items.search(player, rng);
        events.push(...foundEvents);
        player.actionsPerformed++;
        break;
      }
    }

    return events;
  }

  private resolveOffensiveAction(
    state: GameState,
    playerId: string,
    action: Action,
    rng: SeededRNG,
  ): GameEvent[] {
    const player = state.players.get(playerId)!;
    const events: GameEvent[] = [];

    switch (action.type) {
      case 'attack': {
        const target = state.players.get(action.targetId);
        if (!target || !target.alive) {
          // Invalid target — random alive enemy
          const alive = getAlivePlayers(state).filter(p => p.id !== playerId);
          if (alive.length === 0) break;
          const randomTarget = rng.pick(alive);

          const result = this.combat.resolveAttack(player, randomTarget, state, rng);
          events.push(...result.evasionEvents);
          for (const dmgEvent of result.damageEvents) {
            this.combat.applyDamage(randomTarget, dmgEvent.amount, playerId);
            player.damageDealt += dmgEvent.amount;
            events.push(dmgEvent);
          }
          // Tick weapon durability
          this.items.tickDurability(player, new Set(['damage_bonus']));
        } else {
          const result = this.combat.resolveAttack(player, target, state, rng);
          events.push(...result.evasionEvents);
          for (const dmgEvent of result.damageEvents) {
            this.combat.applyDamage(target, dmgEvent.amount, playerId);
            player.damageDealt += dmgEvent.amount;
            events.push(dmgEvent);
          }
          // Check for poison weapons
          const poisonWeapon = player.inventory.find(i => i.effect.type === 'poison_attack');
          if (poisonWeapon && result.damageEvents.length > 0) {
            const statusEvent = this.status.apply(target, 'poisoned', poisonWeapon.effect.value, 1, playerId);
            events.push(statusEvent);
          }
          this.items.tickDurability(player, new Set(['damage_bonus']));
        }
        player.actionsPerformed++;
        break;
      }
      case 'betray_teammate': {
        const teammate = state.players.get(action.targetId);
        if (!teammate || !teammate.alive) break;

        const result = this.combat.resolveAttack(player, teammate, state, rng, true);
        events.push(...result.evasionEvents);

        let totalDamage = 0;
        for (const dmgEvent of result.damageEvents) {
          this.combat.applyDamage(teammate, dmgEvent.amount, playerId);
          player.damageDealt += dmgEvent.amount;
          totalDamage += dmgEvent.amount;
          events.push(dmgEvent);
        }

        events.push({
          type: 'betray',
          playerId,
          targetId: action.targetId,
          damage: totalDamage,
        } satisfies BetrayEvent);

        // Betrayal dissolves the team
        if (player.teamId) {
          const teamPlayers = Array.from(state.players.values())
            .filter(p => p.teamId === player.teamId);
          for (const tp of teamPlayers) {
            tp.teamId = null;
          }
        }

        player.actionsPerformed++;
        break;
      }
    }

    return events;
  }
}
