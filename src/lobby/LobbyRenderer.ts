import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { GameState, getAlivePlayers } from '../game/models/GameState.js';
import { GAME_CONSTANTS } from '../game/constants.js';
import { getLocale } from '../i18n/index.js';

/**
 * Renders the lobby as a Discord Components V2 message.
 * Returns components array and flags ready for message.send() or message.edit().
 */
export function renderLobby(state: GameState) {
  const players = Array.from(state.players.values());
  const playerCount = players.length;
  const { MIN_PLAYERS, MAX_PLAYERS } = GAME_CONSTANTS;

  const strings = getLocale(state.language);

  // ── Title ───────────────────────────────────────────
  const title = new TextDisplayBuilder()
    .setContent(strings.lobbyTitle);

  const subtitle = new TextDisplayBuilder()
    .setContent(strings.lobbySubtitle);

  // ── Game info ───────────────────────────────────────
  const statusEmoji = state.phase === 'lobby' ? '🟡' : state.phase === 'active' ? '🟢' : '🔴';
  const statusText = state.phase === 'lobby' ? strings.lobbyStatusWaiting : state.phase === 'active' ? strings.lobbyStatusActive : strings.lobbyStatusFinished;

  const gameInfo = new TextDisplayBuilder()
    .setContent(
      `${statusEmoji} **${strings.lobbyStatus}:** ${statusText}\n` +
      `👥 **${strings.lobbyPlayers}:** ${playerCount}/${MAX_PLAYERS} (min: ${MIN_PLAYERS})\n` +
      `🎲 **${strings.lobbyMatch}:** \`${state.matchId}\``
    );

  // ── Player list ─────────────────────────────────────
  let playerList: string;
  if (playerCount === 0) {
    playerList = strings.lobbyNoPlayers;
  } else {
    playerList = players.map((p, i) => {
      const teamBadge = p.teamId ? strings.lobbyTeamBadge(p.teamId) : '';
      return `${i + 1}. <@${p.id}>${teamBadge}`;
    }).join('\n');
  }

  const playerSection = new TextDisplayBuilder()
    .setContent(`${strings.lobbyPlayerListHeader}\n${playerList}`);

  // ── Buttons ─────────────────────────────────────────
  const canStart = playerCount >= MIN_PLAYERS;
  const canJoin = playerCount < MAX_PLAYERS && state.phase === 'lobby';

  const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('lobby_join')
      .setLabel(strings.lobbyBtnJoin)
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canJoin),
    new ButtonBuilder()
      .setCustomId('lobby_leave')
      .setLabel(strings.lobbyBtnLeave)
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(state.phase !== 'lobby'),
    new ButtonBuilder()
      .setCustomId('lobby_start')
      .setLabel(strings.lobbyBtnStart)
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canStart || state.phase !== 'lobby'),
    new ButtonBuilder()
      .setCustomId('lobby_team')
      .setLabel(strings.lobbyBtnTeam)
      .setEmoji('🤝')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.phase !== 'lobby' || playerCount < 2),
  );

  // ── Assemble container ──────────────────────────────
  const container = new ContainerBuilder()
    .addTextDisplayComponents(title)
    .addTextDisplayComponents(subtitle)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(gameInfo)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(playerSection)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(mainRow);

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
}

/**
 * Renders a minimal lobby update after the game has started.
 */
export function renderLobbyStarted(state: GameState) {
  const aliveCount = getAlivePlayers(state).length;
  const totalPlayers = state.players.size;

  const strings = getLocale(state.language);
  const currentRound = state.phase === 'active' ? state.round + 1 : state.round;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(strings.lobbyInProgress)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🟢 **${strings.lobbyRound}:** ${currentRound}\n` +
        `💀 **${strings.lobbyAlive}:** ${aliveCount}/${totalPlayers}\n` +
        `🎲 **${strings.lobbyMatch}:** \`${state.matchId}\`\n\n` +
        `${strings.lobbyWatchChannel}`
      )
    );

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
}
