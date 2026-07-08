import { Client, Message, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { Player } from '../game/models/Player.js';
import { Action } from '../game/models/Action.js';
import { GameState } from '../game/models/GameState.js';
import { renderActionChoice, renderActionConfirmation } from '../rendering/DMActionRenderer.js';
import { GAME_CONSTANTS } from '../game/constants.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DMHandler');

/**
 * Manages sending DM action choices to selected players and collecting responses.
 */
export class DMHandler {
  /**
   * Pending action choices: playerId → { resolve, reject, actionType? }
   *
   * IMPORTANT: Entries are created BEFORE DMs are sent to prevent a race
   * condition where a player clicks their button before waitForAction() runs.
   */
  private pendingActions: Map<string, {
    resolve: (action: Action) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout> | null;
    actionType?: string;
  }> = new Map();

  /** DM messages sent to players (for editing) */
  private dmMessages: Map<string, Message> = new Map();

  constructor(private client: Client) {}

  /**
   * Sends action choice DMs to selected players and waits for all responses.
   * Returns a map of playerId → Action (with defaults for timeouts).
   */
  async collectActions(
    state: GameState,
    selectedPlayerIds: string[],
    timeoutMs: number = GAME_CONSTANTS.ACTION_TIMEOUT_MS,
  ): Promise<Map<string, Action>> {
    const actions = new Map<string, Action>();
    const allPlayers = Array.from(state.players.values());

    // ── PRE-RESERVE all pending slots BEFORE sending DMs ──────────────
    // This eliminates the race where a player clicks before waitForAction runs.
    for (const playerId of selectedPlayerIds) {
      const player = state.players.get(playerId);
      if (!player || !player.alive) continue;
      this.reserveAction(playerId);
    }

    // ── Send DMs to all selected players ──────────────────────────────
    const dmPromises = selectedPlayerIds.map(async (playerId) => {
      const player = state.players.get(playerId);
      if (!player || !player.alive) return;

      try {
        await this.sendActionDM(player, state.round + 1, allPlayers, player.language);
      } catch (error) {
        log.error(`Failed to DM player ${player.username}`, error);
        // Player can't receive DMs — cancel the pending slot and use default
        this.cancelPendingAction(playerId);
        actions.set(playerId, { type: 'defend' });
      }
    });

    await Promise.all(dmPromises);

    // ── Wait for responses with timeout ───────────────────────────────
    const responsePromises = selectedPlayerIds.map(async (playerId) => {
      if (actions.has(playerId)) return; // Already has default from DM failure

      try {
        const action = await this.attachTimeout(playerId, timeoutMs);
        actions.set(playerId, action);
      } catch {
        // Timeout — use default action
        actions.set(playerId, { type: 'defend' });
        log.info(`Player ${playerId} timed out — defaulting to defend`);

        // Notify player of timeout
        try {
          const dmMessage = this.dmMessages.get(playerId);
          if (dmMessage) {
            const player = state.players.get(playerId);
            const strings = getLocale(player?.language || state.language);
            const timeoutContainer = new ContainerBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(strings.dmTimeout)
              );

            await dmMessage.edit({
              components: [timeoutContainer],
              flags: [MessageFlags.IsComponentsV2] as const,
            });
          }
        } catch (err) {
          log.warn(`Failed to edit timeout DM for player ${playerId}: ${err}`);
        }
      }
    });

    await Promise.all(responsePromises);

    // Cleanup
    this.pendingActions.clear();
    this.dmMessages.clear();

    return actions;
  }

  /**
   * Pre-reserves a pending action slot for a player BEFORE the DM is sent.
   * The promise resolve/reject are stored so handleActionChoice can resolve immediately
   * even if the player clicks before attachTimeout() runs.
   */
  private reserveAction(playerId: string): void {
    if (this.pendingActions.has(playerId)) return;
    // Create a stub entry with no timer yet — timer attached later by attachTimeout()
    this.pendingActions.set(playerId, {
      resolve: () => {},   // overwritten by attachTimeout
      reject: () => {},    // overwritten by attachTimeout
      timer: null,
    });
  }

  /**
   * Attaches the actual resolve/reject and timeout to an already-reserved slot.
   * If the action was already resolved (player clicked before this ran),
   * the stored action is returned immediately.
   */
  private attachTimeout(playerId: string, timeoutMs: number): Promise<Action> {
    return new Promise<Action>((resolve, reject) => {
      const existing = this.pendingActions.get(playerId);

      // Slot was already removed — means handleActionChoice already resolved it via a temp store
      if (!existing) {
        // Shouldn't happen with the new flow, but guard anyway
        reject(new Error('No pending slot'));
        return;
      }

      const timer = setTimeout(() => {
        this.pendingActions.delete(playerId);
        reject(new Error('Timeout'));
      }, timeoutMs);

      // Overwrite the stub resolve/reject with real ones + attach timer
      existing.resolve = (action: Action) => {
        clearTimeout(timer);
        this.pendingActions.delete(playerId);
        resolve(action);
      };
      existing.reject = (err: Error) => {
        clearTimeout(timer);
        this.pendingActions.delete(playerId);
        reject(err);
      };
      existing.timer = timer;
    });
  }

  /**
   * Cancels and removes a pending action slot (e.g. DM send failed).
   */
  private cancelPendingAction(playerId: string): void {
    const existing = this.pendingActions.get(playerId);
    if (existing?.timer) clearTimeout(existing.timer);
    this.pendingActions.delete(playerId);
  }

  /**
   * Sends an action choice DM to a player.
   */
  private async sendActionDM(
    player: Player,
    roundNumber: number,
    allPlayers: Player[],
    language: string,
  ): Promise<void> {
    try {
      // Force-fetch the user from the API to ensure the cache is populated.
      // After a bot restart/resume, user objects may not be in cache,
      // causing createDM() to fail with "Cannot read properties of null".
      const user = await this.client.users.fetch(player.id, { force: true });
      const dmChannel = await user.createDM();

      const rendered = renderActionChoice(player, roundNumber, allPlayers, language);
      const message = await dmChannel.send({
        components: rendered.components,
        flags: rendered.flags,
      });

      this.dmMessages.set(player.id, message);
      log.debug(`Sent action DM to ${player.username}`);
    } catch (error) {
      log.error(`Cannot DM ${player.username} — DMs might be disabled`, error);
      throw error;
    }
  }

  /**
   * Called when a player clicks an action button in their DM.
   * For immediate actions, resolves the pending promise.
   * For targeted actions, stores the action type and waits for target selection.
   */
  handleActionChoice(playerId: string, actionType: string): boolean {
    const pending = this.pendingActions.get(playerId);
    if (!pending) return false;

    // Check if this action requires a target
    const needsTarget = ['attack', 'help_teammate', 'betray_teammate'].includes(actionType);

    if (needsTarget) {
      // Store action type and wait for target selection
      pending.actionType = actionType;
      return true; // Indicates target selection needed
    }

    // Immediate action — resolve now
    pending.resolve({ type: actionType } as Action);
    return false;
  }

  /**
   * Called when a player selects a target from the select menu.
   */
  handleTargetChoice(playerId: string, actionType: string, targetId: string): boolean {
    const pending = this.pendingActions.get(playerId);
    if (!pending) return false;

    const action: Action = {
      type: actionType as any,
      targetId,
    } as Action;

    pending.resolve(action);
    return true;
  }

  /**
   * Returns the DM message for a player (for editing).
   */
  getDMMessage(playerId: string): Message | undefined {
    return this.dmMessages.get(playerId);
  }

  /**
   * Checks if a player has a pending action.
   */
  hasPendingAction(playerId: string): boolean {
    return this.pendingActions.has(playerId);
  }

  /**
   * Gets the pending action type for a player (for targeted actions).
   */
  getPendingActionType(playerId: string): string | undefined {
    return this.pendingActions.get(playerId)?.actionType;
  }
}
