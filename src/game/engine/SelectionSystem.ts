import { Player } from '../models/Player.js';
import { GameState, getAlivePlayers } from '../models/GameState.js';
import { GAME_CONSTANTS } from '../constants.js';
import { SeededRNG } from '../../utils/helpers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('SelectionSystem');

/**
 * Determines which alive players are selected to act each round.
 * Ensures fairness by weighting players who haven't acted recently.
 */
export class SelectionSystem {
  /**
   * Selects a subset of alive players to act this round.
   * Uses weighted random selection favoring players who haven't acted recently.
   */
  selectPlayers(state: GameState, rng: SeededRNG): string[] {
    const alive = getAlivePlayers(state);

    if (alive.length <= GAME_CONSTANTS.MIN_SELECTED) {
      // If few players remain, everyone acts
      return alive.map(p => p.id);
    }

    // Calculate how many players to select
    const targetCount = Math.max(
      GAME_CONSTANTS.MIN_SELECTED,
      Math.ceil(alive.length * GAME_CONSTANTS.SELECTION_RATIO),
    );

    // Weight each player by how long they've waited
    const weighted = alive.map(player => ({
      player,
      // Higher weight = more likely to be selected
      weight: 1 + player.roundsSinceLastAction * 2,
    }));

    const selected: Player[] = [];
    const remaining = [...weighted];

    while (selected.length < targetCount && remaining.length > 0) {
      const totalWeight = remaining.reduce((sum, w) => sum + w.weight, 0);
      let roll = rng.nextFloat(0, totalWeight);

      let chosenIndex = 0;
      for (let i = 0; i < remaining.length; i++) {
        roll -= remaining[i].weight;
        if (roll <= 0) {
          chosenIndex = i;
          break;
        }
      }

      selected.push(remaining[chosenIndex].player);
      remaining.splice(chosenIndex, 1);
    }

    const selectedIds = selected.map(p => p.id);
    log.debug(`Selected ${selectedIds.length}/${alive.length} players for round`);
    return selectedIds;
  }

  /**
   * Updates round-since-last-action counters after selection.
   */
  updateCounters(state: GameState, selectedIds: Set<string>): void {
    for (const player of state.players.values()) {
      if (!player.alive) continue;

      if (selectedIds.has(player.id)) {
        player.roundsSinceLastAction = 0;
        player.selectedThisRound = true;
      } else {
        player.roundsSinceLastAction++;
        player.selectedThisRound = false;
      }
    }
  }
}
