import {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  TextChannel,
  TextDisplayBuilder,
  ThreadChannel,
} from 'discord.js';
import { GameEngine } from '../game/engine/GameEngine.js';
import { GameState, createGameState, getAlivePlayers, getDeadPlayers } from '../game/models/GameState.js';
import { Action, ACTION_DEFINITIONS, TargetedActionType } from '../game/models/Action.js';
import { LobbyManager } from '../lobby/LobbyManager.js';
import { renderLobby, renderLobbyStarted } from '../lobby/LobbyRenderer.js';
import { renderRoundSummary, renderGameOver } from '../rendering/RoundSummaryRenderer.js';
import { DeathEvent } from '../game/models/RoundResult.js';
import { renderTargetSelection, renderActionConfirmation, renderActionChoice } from '../rendering/DMActionRenderer.js';
import { DMHandler } from '../interactions/DMHandler.js';
import { Narrator } from '../narrator/Narrator.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NarrationContext } from '../types/game.js';
import { SeededRNG, generateSeed, generateMatchId, delay } from '../utils/helpers.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GameSession');

/**
 * Orchestrates a full game lifecycle from lobby creation to winner announcement.
 * Each GameSession represents a single match in a single channel.
 *
 * Lifecycle: lobby → round loop (select → DM → collect → engine → narrate → post) → game over
 */
export class GameSession {
  private state: GameState;
  private lobby: LobbyManager;
  private engine: GameEngine;
  private narrator: Narrator;
  private storage: StorageProvider;
  private dmHandler: DMHandler;
  private rng: SeededRNG;
  private channel: TextChannel | null = null;
  private thread: ThreadChannel | null = null;

  /** Whether the game loop is currently running */
  private running: boolean = false;

  private get postTarget(): TextChannel | ThreadChannel | null {
    return this.thread || this.channel;
  }

  constructor(
    private client: Client,
    channelId: string,
    guildId: string,
    language: string,
    narrator: Narrator,
    storage: StorageProvider,
    requiredRoleId: string | null = null,
    creatorId: string = '',
  ) {
    const seed = generateSeed();
    const matchId = generateMatchId();

    this.state = createGameState(matchId, channelId, guildId, seed, language, requiredRoleId, creatorId);
    this.lobby = new LobbyManager(this.state);
    this.engine = new GameEngine();
    this.narrator = narrator;
    this.storage = storage;
    this.dmHandler = new DMHandler(client);
    this.rng = new SeededRNG(seed);

    log.info(`Session created: ${matchId} (channel: ${channelId}, seed: ${seed}, lang: ${language})`);
  }

  /** Returns the lobby manager for external access */
  getLobbyManager(): LobbyManager {
    return this.lobby;
  }

  /** Returns the current game state */
  getState(): GameState {
    return this.state;
  }

  /** Returns whether this session has a specific player */
  hasPlayer(playerId: string): boolean {
    return this.state.players.has(playerId);
  }

  /**
   * Initializes the lobby by sending the lobby message.
   */
  async initLobby(interaction: ChatInputCommandInteraction): Promise<void> {
    const rendered = renderLobby(this.state);

    await interaction.reply({
      components: rendered.components,
      flags: rendered.flags,
      fetchReply: true,
    });

    // Fetch the reply message for future edits
    const message = await interaction.fetchReply();
    this.lobby.setLobbyMessage(message);

    // Cache the channel
    this.channel = interaction.channel as TextChannel;

    log.info(`Lobby message sent for match ${this.state.matchId}`);
  }

  /**
   * Starts the game — transitions from lobby to active and begins the round loop.
   */
  async startGame(): Promise<void> {
    this.lobby.startGame();

    // Update lobby message to show "in progress" and create the thread
    const lobbyMessage = this.lobby.getLobbyMessage();
    if (lobbyMessage) {
      const rendered = renderLobbyStarted(this.state);
      await lobbyMessage.edit({
        components: rendered.components,
      });

      try {
        const strings = getLocale(this.state.language);
        this.thread = await lobbyMessage.startThread({
          name: strings.threadName(this.state.matchId),
          autoArchiveDuration: 60,
        });
        this.state.threadId = this.thread.id;
        log.info(`Created thread ${this.thread.id} for match ${this.state.matchId}`);
      } catch (err) {
        log.error(`Failed to create thread for match ${this.state.matchId}`, err);
      }
    }

    // Save to database (transitioned to active phase, including threadId)
    await this.saveActiveState();

    // Send a start announcement
    const target = this.postTarget;
    if (target) {
      const strings = getLocale(this.state.language);
      await target.send({
        embeds: [{
          title: strings.gameStartTitle,
          description: strings.gameStartDesc(this.state.players.size),
          color: 0xED4245,
          footer: { text: `${strings.lobbyMatch}: ${this.state.matchId}` },
        }],
      });
    }

    log.info(`Game started: ${this.state.matchId}`);

    // Begin the game loop
    this.running = true;
    this.runGameLoop().catch(err => {
      log.error('Game loop crashed', err);
      this.running = false;
    });
  }

  /**
   * Main game loop — executes rounds until a winner emerges.
   */
  private async runGameLoop(): Promise<void> {
    while (this.running && this.state.phase === 'active') {
      try {
        if (!this.channel) {
          try {
            this.channel = await this.client.channels.fetch(this.state.channelId) as TextChannel;
            log.info(`Channel re-fetched for session ${this.state.matchId}`);
          } catch {
            log.warn(`Cannot fetch channel ${this.state.channelId} — messages will be skipped this round`);
          }
        }

        if (this.channel && !this.thread && this.state.threadId) {
          try {
            this.thread = await this.client.channels.fetch(this.state.threadId) as ThreadChannel;
            log.info(`Thread re-fetched for session ${this.state.matchId}`);
          } catch {
            log.warn(`Cannot fetch thread ${this.state.threadId} — messages will fall back to channel`);
          }
        }

        await this.executeRound();

        // Check for game end (cast avoids type narrowing from while condition)
        if ((this.state as { phase: string }).phase === 'finished') {
          await this.handleGameOver();
          break;
        }

        // Brief pause between rounds for readability
        await delay(3000);
      } catch (error) {
        log.error(`Error in round ${this.state.round + 1}`, error);

        // Post error message and continue to next round
        const target = this.postTarget;
        if (target) {
          try {
            const strings = getLocale(this.state.language);
            await target.send({
              content: strings.errorOccurred,
            });
          } catch {
            // send may fail — not critical
          }
        }
        await delay(2000);
      }
    }
  }

  /**
   * Executes a single round.
   */
  private async executeRound(): Promise<void> {
    const alivePlayers = getAlivePlayers(this.state);

    // ── 1. Select players ─────────────────────────────
    const selectedIds = this.engine.selectPlayers(this.state, this.rng);
    log.info(`Round ${this.state.round + 1}: Selected ${selectedIds.length}/${alivePlayers.length} players`);

    // ── 2. Notify channel that a round is starting ────
    const target = this.postTarget;
    if (target) {
      const strings = getLocale(this.state.language);
      const selectedNames = selectedIds.map(id => {
        const p = this.state.players.get(id);
        return p ? `<@${p.id}>` : 'Unknown';
      });

      await target.send({
        content: `${strings.roundNotice(this.state.round + 1)}${selectedNames.join(', ')}${strings.roundCheckDMs}`,
      });
    }

    // ── 3. Collect actions via DMs ────────────────────
    const actions = await this.dmHandler.collectActions(this.state, selectedIds);

    // ── 4. Run engine ─────────────────────────────────
    const result = this.engine.executeRound(this.state, actions, this.rng);

    // ── 5. Generate narration ─────────────────────────
    const alive = getAlivePlayers(this.state);
    const dead = getDeadPlayers(this.state);
    const allPlayers = Array.from(this.state.players.values());

    const narrationContext: NarrationContext = {
      roundNumber: result.roundNumber,
      result,
      alivePlayers: alive,
      deadPlayers: dead,
      allPlayers,
      history: this.state.narrationHistory,
      language: this.state.language,
    };

    let narration: string;
    try {
      narration = await this.narrator.narrate(narrationContext);
    } catch (error) {
      log.error('Narration failed completely', error);
      const strings = getLocale(this.state.language);
      narration = strings.narratorUneventful;
    }

    // Store narration in history
    this.state.narrationHistory.push(narration);

    // ── 6. Post round summary ─────────────────────────
    if (target) {
      const summaryEmbed = renderRoundSummary(this.state, result, narration);
      await target.send({ embeds: [summaryEmbed] });
    }

    // ── 7. Send Death DMs to newly dead players ───────
    if (result.deaths.length > 0) {
      const aliveCount = result.aliveCount;
      const roundNumber = result.roundNumber;

      for (const deadPlayerId of result.deaths) {
        const deadPlayer = this.state.players.get(deadPlayerId);
        if (!deadPlayer) continue;

        try {
          const strings = getLocale(deadPlayer.language);
          const user = await this.client.users.fetch(deadPlayerId, { force: true });
          const dmChannel = await user.createDM();

          let causeText = strings.dmDeathPerished;
          const deathEvent = result.events.find(
            (e) => e.type === 'death' && e.playerId === deadPlayerId
          ) as DeathEvent | undefined;

          if (deathEvent && deathEvent.killerId) {
            const killer = this.state.players.get(deathEvent.killerId);
            if (killer) {
              causeText = strings.dmDeathKilledBy(killer.username);
            }
          }

          await dmChannel.send({
            embeds: [
              {
                title: strings.dmDeathTitle,
                description: causeText,
                color: 0x747f8d,
                fields: [
                  { name: strings.dmDeathRound(roundNumber), value: '\u200b', inline: true },
                  { name: strings.dmDeathAlive(aliveCount), value: '\u200b', inline: true },
                ],
                footer: { text: `${strings.dmDeathMatch}: ${this.state.matchId}` },
              },
            ],
          });
          log.info(`Sent death DM to ${deadPlayer.username}`);
        } catch (err) {
          log.error(`Failed to send death DM to player ${deadPlayer.username}`, err);
        }
      }
    }

    // ── 8. Update lobby message ───────────────────────
    const lobbyMessage = this.lobby.getLobbyMessage();
    if (lobbyMessage) {
      const rendered = renderLobbyStarted(this.state);
      try {
        await lobbyMessage.edit({
          components: rendered.components,
        });
      } catch {
        // Lobby message may have been deleted
      }
    }

    log.info(`Round ${result.roundNumber} complete. Alive: ${result.aliveCount}`);

    // Persist current state after round completion
    await this.saveActiveState();
  }

  /**
   * Handles the end of the game — posts winner announcement and saves match.
   */
  private async handleGameOver(): Promise<void> {
    this.running = false;

    const target = this.postTarget;
    if (target) {
      const gameOverEmbed = renderGameOver(this.state);
      await target.send({ embeds: [gameOverEmbed] });
    }

    // Save match to storage
    try {
      const winner = this.state.winnerId ? this.state.players.get(this.state.winnerId) : null;
      await this.storage.saveMatch({
        matchId: this.state.matchId,
        guildId: this.state.guildId,
        channelId: this.state.channelId,
        winnerId: this.state.winnerId,
        winnerName: winner?.username || null,
        playerCount: this.state.players.size,
        roundCount: this.state.round,
        seed: this.state.seed,
        startedAt: this.state.startedAt || Date.now(),
        endedAt: this.state.endedAt || Date.now(),
        fullState: JSON.parse(JSON.stringify(this.state, replacer)),
      });
      log.info(`Match ${this.state.matchId} saved to storage`);

      // Deletes the active session from the database on game completion
      await this.storage.deleteActiveSession(this.state.channelId);
    } catch (error) {
      log.error('Failed to save match', error);
    }

    log.info(`Game over: ${this.state.matchId}. Winner: ${this.state.winnerId || 'None'}`);
  }

  /**
   * Reconstructs an existing game session from loaded state (e.g. after bot restart).
   */
  static fromState(
    client: Client,
    state: GameState,
    narrator: Narrator,
    storage: StorageProvider,
  ): GameSession {
    const session = new GameSession(
      client,
      state.channelId,
      state.guildId,
      state.language,
      narrator,
      storage,
      state.requiredRoleId,
      state.creatorId,
    );

    session.state = state;
    session.lobby = new LobbyManager(state);
    session.rng = new SeededRNG(state.seed);

    return session;
  }

  /**
   * Resumes the session: fetches channel/messages and starts loop if active.
   */
  async resume(): Promise<void> {
    try {
      this.channel = await this.client.channels.fetch(this.state.channelId) as TextChannel;

      if (this.state.lobbyMessageId && this.channel) {
        try {
          const msg = await this.channel.messages.fetch(this.state.lobbyMessageId);
          this.lobby.setLobbyMessage(msg);
        } catch {
          log.warn(`Failed to fetch lobby message ${this.state.lobbyMessageId} on resume`);
        }
      }

      if (this.state.threadId) {
        try {
          this.thread = await this.client.channels.fetch(this.state.threadId) as ThreadChannel;
          log.info(`Fetched thread ${this.state.threadId} on resume`);
        } catch {
          log.warn(`Failed to fetch thread ${this.state.threadId} on resume`);
        }
      }

      log.info(`Resumed session ${this.state.matchId} (phase: ${this.state.phase}, round: ${this.state.round})`);

      if (this.state.phase === 'active') {
        this.running = true;
        this.runGameLoop().catch(err => {
          log.error(`Resumed game loop crashed for ${this.state.matchId}`, err);
          this.running = false;
        });
      }
    } catch (err) {
      log.error(`Failed to resume session ${this.state.matchId} in channel ${this.state.channelId}`, err);
    }
  }

  /**
   * Persists active session state to the database.
   */
  async saveActiveState(): Promise<void> {
    try {
      await this.storage.saveActiveSession(this.state);
    } catch (error) {
      log.error(`Failed to save active session state for ${this.state.matchId}`, error);
    }
  }

  /**
   * Handles a player's action button click in DMs.
   */
  async handleActionChoice(interaction: ButtonInteraction, actionType: string): Promise<void> {
    const playerId = interaction.user.id;
    const player = this.state.players.get(playerId);
    const playerLang = player?.language || this.state.language;
    const strings = getLocale(playerLang);

    if (!player || !player.alive) {
      await interaction.followUp({
        content: `❌ ${strings.errPlayerDead}`,
        ephemeral: true,
      });
      return;
    }

    if (!this.dmHandler.hasPendingAction(playerId)) {
      await interaction.followUp({
        content: `❌ ${strings.dmNone}`,
        ephemeral: true,
      });
      return;
    }

    const needsTarget = this.dmHandler.handleActionChoice(playerId, actionType);

    if (needsTarget) {
      // Show target selection
      const alive = getAlivePlayers(this.state);
      const def = ACTION_DEFINITIONS[actionType as keyof typeof ACTION_DEFINITIONS];

      let targets;
      if (def.targetFilter === 'teammates') {
        targets = alive.filter(p => p.id !== playerId && p.teamId === player.teamId);
      } else {
        targets = alive.filter(p => p.id !== playerId);
      }

      if (targets.length === 0) {
        // No valid targets — resolve as defend
        this.dmHandler.handleActionChoice(playerId, 'defend');
        await interaction.editReply(renderActionConfirmation('defend', undefined, playerLang));
        return;
      }

      const rendered = renderTargetSelection(actionType as TargetedActionType, player, targets, playerLang);
      await interaction.editReply({
        components: rendered.components,
        flags: rendered.flags,
      });
    } else {
      // Immediate action — show confirmation
      const rendered = renderActionConfirmation(actionType as any, undefined, playerLang);
      await interaction.editReply({
        components: rendered.components,
        flags: rendered.flags,
      });
    }
  }

  /**
   * Handles a player's target selection from a select menu.
   */
  async handleTargetChoice(
    interaction: AnySelectMenuInteraction,
    actionType: string,
    targetId: string,
  ): Promise<void> {
    const playerId = interaction.user.id;
    const player = this.state.players.get(playerId);
    const playerLang = player?.language || this.state.language;
    const strings = getLocale(playerLang);

    if (!player || !player.alive) {
      await interaction.followUp({
        content: `❌ ${strings.errPlayerDead}`,
        ephemeral: true,
      });
      return;
    }

    if (!this.dmHandler.hasPendingAction(playerId)) {
      await interaction.followUp({
        content: `❌ ${strings.dmNone}`,
        ephemeral: true,
      });
      return;
    }

    this.dmHandler.handleTargetChoice(playerId, actionType, targetId);

    const target = this.state.players.get(targetId);
    const rendered = renderActionConfirmation(actionType as any, target?.username, playerLang);
    await interaction.editReply({
      components: rendered.components,
      flags: rendered.flags,
    });
  }

  /**
   * Handles direct item use when a player clicks an item button.
   * Applies the item effect immediately (does NOT consume the round action).
   */
  async handleItemUseDirect(interaction: ButtonInteraction, itemId: string): Promise<void> {
    const playerId = interaction.user.id;
    const player = this.state.players.get(playerId);
    const playerLang = player?.language || this.state.language;
    const strings = getLocale(playerLang);

    if (!player || !player.alive) {
      await interaction.followUp({ content: `❌ ${strings.errPlayerDead}`, ephemeral: true });
      return;
    }

    // Apply item effect via engine ItemSystem
    const result = this.engine.useItemOnPlayer(player, itemId);

    if (!result) {
      await interaction.followUp({ content: strings.dmItemNotUsable, ephemeral: true });
      return;
    }

    // Save the new state immediately to the database (prevents desync on crash/restart)
    await this.saveActiveState();

    // Show confirmation and re-render action choice screen with new player state
    const allPlayers = Array.from(this.state.players.values());
    const actionRendered = renderActionChoice(player, this.state.round + 1, allPlayers, playerLang);

    const confirmText = strings.dmItemUsed(result.itemName, result.effectDesc);

    // Prepend item-use confirmation, then show the full action choice again
    const infoContainer = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(confirmText));

    await interaction.editReply({
      components: [infoContainer, ...actionRendered.components],
      flags: actionRendered.flags,
    });
  }
}

/**
 * JSON replacer that handles Map serialization.
 */
function replacer(key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries()),
    };
  }
  return value;
}
