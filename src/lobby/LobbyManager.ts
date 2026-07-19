import { Message } from 'discord.js';
import { GameState, getAlivePlayers } from '../game/models/GameState.js';
import { createPlayer } from '../game/models/Player.js';
import { GAME_CONSTANTS } from '../game/constants.js';
import { renderLobby } from './LobbyRenderer.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { LobbyError } from '../utils/errors.js';

const log = createLogger('LobbyManager');

/**
 * Manages lobby operations: joining, leaving, teaming up, and starting the game.
 * Operates on a GameState and updates the lobby Discord message.
 */
export class LobbyManager {
  private lobbyMessage: Message | null = null;

  constructor(private state: GameState) { }

  /** Returns the current game state */
  getState(): GameState {
    return this.state;
  }

  /** Sets the lobby Discord message reference for future edits */
  setLobbyMessage(message: Message): void {
    this.lobbyMessage = message;
    this.state.lobbyMessageId = message.id;
  }

  /** Returns the lobby message */
  getLobbyMessage(): Message | null {
    return this.lobbyMessage;
  }

  /**
   * Adds a player to the lobby.
   */
  addPlayer(userId: string, username: string, language: string = 'en'): void {
    const strings = getLocale(this.state.language);
    if (this.state.phase !== 'lobby') {
      throw new LobbyError(strings.errGameStarted, 'GAME_ALREADY_STARTED');
    }
    if (this.state.players.has(userId)) {
      throw new LobbyError(strings.errAlreadyJoined, 'ALREADY_JOINED');
    }
    if (this.state.players.size >= GAME_CONSTANTS.MAX_PLAYERS) {
      throw new LobbyError(strings.errLobbyFull, 'LOBBY_FULL');
    }

    const player = createPlayer(userId, username, GAME_CONSTANTS.BASE_MAX_HP, language);
    this.state.players.set(userId, player);
    log.info(`Player ${username} (${userId}) joined lobby ${this.state.matchId} [lang: ${language}]`);
  }

  /**
   * Removes a player from the lobby.
   */
  removePlayer(userId: string): void {
    const strings = getLocale(this.state.language);
    if (this.state.phase !== 'lobby') {
      throw new LobbyError(strings.errGameStarted, 'GAME_ALREADY_STARTED');
    }
    if (!this.state.players.has(userId)) {
      throw new LobbyError(strings.errNotInGame, 'NOT_IN_GAME');
    }

    const player = this.state.players.get(userId)!;

    // If this player was in a team, dissolve the team
    if (player.teamId) {
      this.dissolveTeam(player.teamId);
    }

    this.state.players.delete(userId);
    log.info(`Player ${player.username} (${userId}) left lobby ${this.state.matchId}`);
  }

  /**
   * Sends a team invite from one player to another.
   * The target must accept for the team to form.
   */
  requestTeamWithTarget(userId: string, targetId: string): { sent: boolean; targetName: string } {
    const strings = getLocale(this.state.language);
    if (this.state.phase !== 'lobby') {
      throw new LobbyError(strings.errGameStarted, 'GAME_ALREADY_STARTED');
    }

    const player = this.state.players.get(userId);
    if (!player) {
      throw new LobbyError(strings.errNotInGame, 'NOT_IN_GAME');
    }
    if (player.teamId) {
      throw new LobbyError(strings.errAlreadyInTeam, 'ALREADY_IN_TEAM');
    }
    if (userId === targetId) {
      throw new LobbyError(strings.errTeamInviteSelf, 'TEAM_INVITE_SELF');
    }

    const target = this.state.players.get(targetId);
    if (!target) {
      throw new LobbyError(strings.errNotInGame, 'TARGET_NOT_IN_GAME');
    }
    if (target.teamId) {
      throw new LobbyError(strings.errTeamTargetInTeam, 'TARGET_IN_TEAM');
    }

    // Store the pending invite in metadata
    target.metadata['pendingTeamInviteFrom'] = userId;
    log.info(`Team invite: ${player.username} → ${target.username}`);
    return { sent: true, targetName: target.username };
  }

  /**
   * Accepts a pending team invite.
   */
  acceptTeamInvite(userId: string): { formed: boolean; partnerId: string; partnerName: string; teamId: string } {
    const strings = getLocale(this.state.language);
    if (this.state.phase !== 'lobby') {
      throw new LobbyError(strings.errGameStarted, 'GAME_ALREADY_STARTED');
    }

    const player = this.state.players.get(userId);
    if (!player) {
      throw new LobbyError(strings.errNotInGame, 'NOT_IN_GAME');
    }

    const inviterId = player.metadata['pendingTeamInviteFrom'] as string | undefined;
    if (!inviterId) {
      throw new LobbyError(strings.errTeamNoInvite, 'NO_INVITE');
    }

    const inviter = this.state.players.get(inviterId);
    if (!inviter) {
      delete player.metadata['pendingTeamInviteFrom'];
      throw new LobbyError(strings.errTeamNoInvite, 'INVITER_LEFT');
    }

    // Check if inviter already joined a team while waiting
    if (inviter.teamId) {
      delete player.metadata['pendingTeamInviteFrom'];
      throw new LobbyError(strings.errTeamTargetInTeam, 'INVITER_IN_TEAM');
    }
    if (player.teamId) {
      delete player.metadata['pendingTeamInviteFrom'];
      throw new LobbyError(strings.errAlreadyInTeam, 'ALREADY_IN_TEAM');
    }

    // Form the team
    const teamId = String(this.state.nextTeamId++);
    player.teamId = teamId;
    inviter.teamId = teamId;
    delete player.metadata['pendingTeamInviteFrom'];
    delete player.metadata['wantsTeam'];
    delete inviter.metadata['wantsTeam'];

    log.info(`Team ${teamId} formed: ${inviter.username} + ${player.username}`);
    return { formed: true, partnerId: inviterId, partnerName: inviter.username, teamId };
  }

  /**
   * Declines a pending team invite.
   */
  declineTeamInvite(userId: string): { declined: boolean; inviterId: string } {
    const strings = getLocale(this.state.language);

    const player = this.state.players.get(userId);
    if (!player) {
      throw new LobbyError(strings.errNotInGame, 'NOT_IN_GAME');
    }

    const inviterId = player.metadata['pendingTeamInviteFrom'] as string | undefined;
    if (!inviterId) {
      throw new LobbyError(strings.errTeamNoInvite, 'NO_INVITE');
    }

    delete player.metadata['pendingTeamInviteFrom'];
    log.info(`Team invite declined: ${player.username} rejected invite from ${inviterId}`);
    return { declined: true, inviterId };
  }

  /**
   * Returns available players for team invite (not in a team, not the requester).
   */
  getAvailableTeamTargets(userId: string): Array<{ id: string; username: string }> {
    return Array.from(this.state.players.values())
      .filter(p => p.id !== userId && !p.teamId)
      .map(p => ({ id: p.id, username: p.username }));
  }

  /**
   * Dissolves a team and removes all players from it.
   */
  dissolveTeam(teamId: string): void {
    for (const player of this.state.players.values()) {
      if (player.teamId === teamId) {
        player.teamId = null;
        delete player.metadata['wantsTeam'];
      }
    }
    log.info(`Team ${teamId} dissolved`);
  }

  /**
   * Validates that the game can start and transitions to 'active'.
   */
  canStart(): { valid: boolean; reason?: string } {
    const strings = getLocale(this.state.language);
    if (this.state.phase !== 'lobby') {
      return { valid: false, reason: strings.errGameStarted };
    }
    if (this.state.players.size < GAME_CONSTANTS.MIN_PLAYERS) {
      return {
        valid: false,
        reason: isNaN(GAME_CONSTANTS.MIN_PLAYERS) ? 'Error' : `${strings.errCannotStart} (min: ${GAME_CONSTANTS.MIN_PLAYERS})`,
      };
    }
    return { valid: true };
  }

  /**
   * Starts the game — transitions from lobby to active.
   */
  startGame(): void {
    const check = this.canStart();
    if (!check.valid) {
      throw new LobbyError(check.reason!, 'CANNOT_START');
    }

    // Clear all waiting-for-team flags
    for (const player of this.state.players.values()) {
      delete player.metadata['wantsTeam'];
    }

    this.state.phase = 'active';
    this.state.round = 0;
    this.state.startedAt = Date.now();

    log.info(`Game ${this.state.matchId} started with ${this.state.players.size} players`);
  }

  /**
   * Updates the lobby message in Discord.
   */
  async updateLobbyMessage(): Promise<void> {
    if (!this.lobbyMessage) return;

    try {
      const rendered = renderLobby(this.state);
      await this.lobbyMessage.edit({
        components: rendered.components,
      });
    } catch (error) {
      log.error('Failed to update lobby message', error);
    }
  }
}
