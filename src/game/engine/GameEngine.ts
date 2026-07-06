import { GameState, getAlivePlayers } from '../models/GameState.js';
import { Action, DEFAULT_ACTION } from '../models/Action.js';
import { RoundResult, DeathEvent, createRoundResult } from '../models/RoundResult.js';
import { SelectionSystem } from './SelectionSystem.js';
import { ActionResolver } from './ActionResolver.js';
import { CombatSystem } from './CombatSystem.js';
import { ItemSystem } from './ItemSystem.js';
import { StatusSystem } from './StatusSystem.js';
import { SeededRNG } from '../../utils/helpers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('GameEngine');

/**
 * The main game engine — orchestrates a full round of gameplay.
 *
 * The engine is completely Discord-agnostic and deterministic.
 * Given the same state, actions, and seed, it will always produce the same result.
 *
 * Round execution order:
 * 1. Clear round-specific effects
 * 2. Tick status effects (DOT damage, HOT healing, expirations)
 * 3. Check for deaths from status effects
 * 4. Resolve player actions (defensive → supportive → offensive)
 * 5. Check for deaths from combat
 * 6. Update player stats
 * 7. Check for game end condition
 */
export class GameEngine {
  private selection: SelectionSystem;
  private resolver: ActionResolver;
  private combat: CombatSystem;
  private items: ItemSystem;
  private status: StatusSystem;

  constructor() {
    this.combat = new CombatSystem();
    this.items = new ItemSystem();
    this.status = new StatusSystem();
    this.selection = new SelectionSystem();
    this.resolver = new ActionResolver(this.combat, this.items, this.status);
  }

  /**
   * Selects which players will act this round.
   */
  selectPlayers(state: GameState, rng: SeededRNG): string[] {
    return this.selection.selectPlayers(state, rng);
  }

  /**
   * Allows a player to use an item from their inventory (outside of round actions).
   */
  useItemOnPlayer(player: import('../models/Player.js').Player, itemId: string): { effectDesc: string; itemName: string } | null {
    return this.items.useItem(player, itemId);
  }

  /**
   * Executes a complete round.
   *
   * @param state - Current game state (will be mutated)
   * @param actions - Map of playerId → Action for selected players
   * @param rng - Seeded random number generator
   * @returns The round result with all events
   */
  executeRound(
    state: GameState,
    actions: Map<string, Action>,
    rng: SeededRNG,
  ): RoundResult {
    state.round++;
    const selectedPlayers = Array.from(actions.keys());
    const result = createRoundResult(state.round, selectedPlayers);

    log.info(`=== Round ${state.round} ===`);
    log.info(`Selected players: ${selectedPlayers.length}`);

    // ── 1. Clear round-specific effects ───────────────
    for (const player of state.players.values()) {
      if (player.alive) {
        this.status.clearRoundEffects(player);
      }
    }

    // ── 2. Tick status effects ────────────────────────
    for (const player of state.players.values()) {
      if (!player.alive) continue;

      const hpBefore = player.hp;
      const tickResult = this.status.tick(player);

      result.events.push(...tickResult.damageEvents);
      result.events.push(...tickResult.expiredEvents);

      for (const expired of tickResult.expiredEvents) {
        result.statusChanges.push({
          playerId: player.id,
          statusType: expired.statusType,
          action: 'expired',
        });
      }

      // Track HP change from status effects
      const hpDelta = player.hp - hpBefore;
      if (hpDelta !== 0) {
        result.hpChanges.set(
          player.id,
          (result.hpChanges.get(player.id) || 0) + hpDelta,
        );
      }
    }

    // ── 3. Check for status effect deaths ─────────────
    this.checkDeaths(state, result, 'status effects');

    // ── 4. Resolve player actions ─────────────────────
    // Fill in default actions for players who didn't respond
    const selectedSet = new Set(selectedPlayers);
    for (const playerId of selectedPlayers) {
      if (!actions.has(playerId)) {
        actions.set(playerId, DEFAULT_ACTION);
      }
    }

    // Update selection counters
    this.selection.updateCounters(state, selectedSet);

    const actionEvents = this.resolver.resolveActions(state, actions, rng);
    result.events.push(...actionEvents);

    // ── 5. Track HP changes from actions ──────────────
    for (const player of state.players.values()) {
      if (!player.alive) continue;

      // We need to recalculate based on damage events
      // HP changes were already applied by CombatSystem
    }

    // Recalculate all HP changes by comparing current HP to tracked values
    for (const event of actionEvents) {
      if (event.type === 'damage') {
        result.hpChanges.set(
          event.targetId,
          (result.hpChanges.get(event.targetId) || 0) - event.amount,
        );
      }
      if (event.type === 'heal') {
        result.hpChanges.set(
          event.playerId,
          (result.hpChanges.get(event.playerId) || 0) + event.actualAmount,
        );
      }
    }

    // Track item changes
    for (const event of actionEvents) {
      if (event.type === 'item_found') {
        result.itemChanges.push({
          playerId: event.playerId,
          itemName: event.itemName,
          action: 'gained',
        });
      }
    }

    // Track status changes from actions
    for (const event of actionEvents) {
      if (event.type === 'status_applied') {
        result.statusChanges.push({
          playerId: event.playerId,
          statusType: event.statusType,
          action: 'applied',
        });
      }
    }

    // ── 6. Check for combat deaths ────────────────────
    this.checkDeaths(state, result, 'combat');

    // ── 7. Update survival stats ──────────────────────
    for (const player of state.players.values()) {
      if (player.alive) {
        player.roundsSurvived++;
      }
    }

    // ── 8. Check game end ─────────────────────────────
    const alive = getAlivePlayers(state);
    result.aliveCount = alive.length;

    if (alive.length <= 1) {
      state.phase = 'finished';
      state.endedAt = Date.now();
      state.winnerId = alive.length === 1 ? alive[0].id : null;
      log.info(`Game over! Winner: ${alive.length === 1 ? alive[0].username : 'None (draw)'}`);
    }

    // Store round result in history
    state.roundHistory.push(result);

    log.info(`Round ${state.round} complete. Alive: ${result.aliveCount}. Deaths: ${result.deaths.length}`);
    return result;
  }

  /**
   * Checks for dead players and generates death events.
   */
  private checkDeaths(state: GameState, result: RoundResult, cause: string): void {
    for (const player of state.players.values()) {
      if (player.alive && player.hp <= 0) {
        player.alive = false;

        // Determine killer from status effects or combat
        let killerId: string | null = null;

        // Check recent damage events for the killer
        for (const event of result.events) {
          if (event.type === 'damage' && event.targetId === player.id) {
            killerId = event.attackerId;
          }
          if (event.type === 'status_damage' && event.playerId === player.id) {
            // Find the source of the status
            const statusEffect = player.statusEffects.find(e => e.type === event.statusType as any);
            if (statusEffect?.sourcePlayerId) {
              killerId = statusEffect.sourcePlayerId;
            }
          }
        }

        // Credit the kill
        if (killerId) {
          const killer = state.players.get(killerId);
          if (killer) {
            killer.kills++;
          }
        }

        result.deaths.push(player.id);
        result.events.push({
          type: 'death',
          playerId: player.id,
          killerId,
          cause,
        } satisfies DeathEvent);

        log.info(`💀 ${player.username} has died (cause: ${cause})`);
      }
    }
  }
}
