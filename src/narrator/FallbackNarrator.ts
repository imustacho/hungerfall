import { Narrator } from './Narrator.js';
import { NarrationContext } from '../types/game.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('FallbackNarrator');

/**
 * Deterministic template-based narrator.
 * Used when the AI narrator is unavailable or fails.
 * Produces readable summaries from structured game events.
 */
export class FallbackNarrator implements Narrator {
  async narrate(context: NarrationContext): Promise<string> {
    const strings = getLocale(context.language);
    const sentences: string[] = [];

    for (const event of context.result.events) {
      switch (event.type) {
        case 'damage': {
          const attacker = context.allPlayers.find(p => p.id === event.attackerId);
          const target = context.allPlayers.find(p => p.id === event.targetId);
          if (!attacker || !target) break;

          if (event.wasDefending) {
            sentences.push(
              strings.narratorAttackDefended(attacker.username, target.username, event.amount)
            );
          } else {
            sentences.push(
              strings.narratorAttack(attacker.username, target.username, event.amount)
            );
          }
          break;
        }

        case 'death': {
          const dead = context.allPlayers.find(p => p.id === event.playerId);
          const killer = event.killerId ? context.allPlayers.find(p => p.id === event.killerId) : null;
          if (!dead) break;

          if (killer) {
            sentences.push(strings.narratorDeathByKill(dead.username, killer.username));
          } else {
            sentences.push(strings.narratorDeathByWounds(dead.username));
          }
          break;
        }

        case 'heal': {
          const healer = context.allPlayers.find(p => p.id === event.playerId);
          if (!healer) break;
          sentences.push(
            strings.narratorHeal(healer.username, event.actualAmount)
          );
          break;
        }

        case 'defend': {
          const defender = context.allPlayers.find(p => p.id === event.playerId);
          if (!defender) break;
          sentences.push(strings.narratorDefend(defender.username));
          break;
        }

        case 'hide': {
          const hider = context.allPlayers.find(p => p.id === event.playerId);
          if (!hider) break;
          sentences.push(strings.narratorHide(hider.username));
          break;
        }

        case 'move': {
          const mover = context.allPlayers.find(p => p.id === event.playerId);
          if (!mover) break;
          sentences.push(strings.narratorMove(mover.username));
          break;
        }

        case 'item_found': {
          const finder = context.allPlayers.find(p => p.id === event.playerId);
          if (!finder) break;
          sentences.push(strings.narratorItemFound(finder.username, event.itemName));
          break;
        }

        case 'evasion': {
          const evader = context.allPlayers.find(p => p.id === event.targetId);
          const missed = context.allPlayers.find(p => p.id === event.attackerId);
          if (!evader || !missed) break;
          sentences.push(
            strings.narratorEvasion(missed.username, evader.username)
          );
          break;
        }

        case 'help': {
          const helper = context.allPlayers.find(p => p.id === event.playerId);
          const helped = context.allPlayers.find(p => p.id === event.targetId);
          if (!helper || !helped) break;
          sentences.push(
            strings.narratorHelp(helper.username, helped.username)
          );
          break;
        }

        case 'betray': {
          const betrayer = context.allPlayers.find(p => p.id === event.playerId);
          const betrayed = context.allPlayers.find(p => p.id === event.targetId);
          if (!betrayer || !betrayed) break;
          sentences.push(
            strings.narratorBetray(betrayer.username, betrayed.username, event.damage)
          );
          break;
        }

        case 'status_damage': {
          const affected = context.allPlayers.find(p => p.id === event.playerId);
          if (!affected) break;
          sentences.push(
            strings.narratorStatusDamage(affected.username, event.amount, event.statusType)
          );
          break;
        }
      }
    }

    // Alive count summary
    const aliveCount = context.alivePlayers.length;
    if (aliveCount <= 3 && aliveCount > 1) {
      sentences.push(strings.narratorRemaining(aliveCount));
    }

    const narration = sentences.join(' ');
    log.debug(`Fallback narration generated (${narration.length} chars)`);
    return narration || strings.narratorUneventful;
  }
}
