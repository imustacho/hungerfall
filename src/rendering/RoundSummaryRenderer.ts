import {
  EmbedBuilder,
  ColorResolvable,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { GameState, getAlivePlayers } from '../game/models/GameState.js';
import { Player } from '../game/models/Player.js';
import { RoundResult } from '../game/models/RoundResult.js';
import { truncate } from '../utils/helpers.js';
import { getLocale } from '../i18n/index.js';

const COLORS = {
  round: 0x5865F2 as ColorResolvable,       // Discord blurple
  death: 0xED4245 as ColorResolvable,        // Red
  victory: 0xFEE75C as ColorResolvable,      // Gold
  peaceful: 0x57F287 as ColorResolvable,     // Green
} as const;

/**
 * Renders a single player's HP status line.
 *
 * Example:
 *   💚 **PlayerName** — 80/100 HP *(+15)*
 */
function renderPlayerHP(player: Player, hpDelta: number | undefined): string {
  const pct = player.maxHp > 0 ? player.hp / player.maxHp : 0;

  // Status icon
  let icon: string;
  if (!player.alive) {
    icon = '💀';
  } else if (pct > 0.6) {
    icon = '💚';
  } else if (pct > 0.3) {
    icon = '💛';
  } else {
    icon = '❤️';
  }

  // Delta annotation
  let deltaText = '';
  if (hpDelta !== undefined && hpDelta !== 0) {
    const sign = hpDelta > 0 ? '+' : '';
    deltaText = ` *(${sign}${hpDelta})*`;
  }

  const teamBadge = player.teamId ? ` 🏷️${player.teamId}` : '';

  return `${icon} **${player.username}**${teamBadge} — ${player.hp}/${player.maxHp} HP${deltaText}`;
}

/**
 * Renders the round summary embed posted in the game channel.
 */
export function renderRoundSummary(
  state: GameState,
  result: RoundResult,
  narration: string,
): EmbedBuilder {
  const strings = getLocale(state.language);
  const alive = getAlivePlayers(state);
  const hasDeath = result.deaths.length > 0;

  const embed = new EmbedBuilder()
    .setTitle(strings.roundTitle(result.roundNumber))
    .setColor(hasDeath ? COLORS.death : COLORS.round)
    .setDescription(truncate(narration, 4000))
    .setTimestamp();

  // ── Deaths ──────────────────────────────────────────
  if (result.deaths.length > 0) {
    const deathLines = result.deaths.map(id => {
      const player = state.players.get(id);
      const deathEvent = result.events.find(e => e.type === 'death' && e.playerId === id);
      const killer = deathEvent && deathEvent.type === 'death' && deathEvent.killerId
        ? state.players.get(deathEvent.killerId)
        : null;

      return killer
        ? strings.roundDeathKilled(player?.username || 'Unknown', killer.username)
        : strings.roundDeathPerished(player?.username || 'Unknown');
    });

    embed.addFields({
      name: strings.roundDeathsHeader,
      value: deathLines.join('\n'),
      inline: false,
    });
  }

  // ── Items Found ─────────────────────────────────────
  const itemsFound = result.itemChanges.filter(c => c.action === 'gained');
  if (itemsFound.length > 0) {
    const itemLines = itemsFound.map(c => {
      const player = state.players.get(c.playerId);
      return strings.roundItemFound(player?.username || 'Unknown', c.itemName);
    });
    embed.addFields({
      name: strings.roundItemsHeader,
      value: truncate(itemLines.join('\n'), 1024),
      inline: false,
    });
  }

  // ── HP Status — all alive players with progress bars ─
  const allPlayers = Array.from(state.players.values());

  // Show alive players first, then dead ones (from this round)
  const aliveRows = alive
    .sort((a, b) => b.hp - a.hp) // Sort by HP descending
    .map(p => renderPlayerHP(p, result.hpChanges.get(p.id)));

  // Show newly dead players from this round
  const newDeadRows = result.deaths
    .map(id => state.players.get(id))
    .filter(Boolean)
    .map(p => renderPlayerHP(p!, result.hpChanges.get(p!.id)));

  const hpRows = [...aliveRows, ...newDeadRows];

  if (hpRows.length > 0) {
    embed.addFields({
      name: strings.roundHPHeader,
      value: truncate(hpRows.join('\n'), 1024),
      inline: false,
    });
  }

  // ── Alive count footer ──────────────────────────────
  embed.setFooter({
    text: strings.roundFooter(result.aliveCount, state.matchId),
  });

  return embed;
}

/**
 * Renders the game over / winner display as Components V2.
 * Returns { components, flags } ready for message.edit() on the lobby message.
 */
export function renderGameOver(state: GameState) {
  const strings = getLocale(state.language);
  const winner = state.winnerId ? state.players.get(state.winnerId) : null;
  const allPlayers = Array.from(state.players.values());

  // Determine if this is a team victory
  const isTeamWin = state.winnerTeamId !== null && !state.winnerId;
  const teamWinners = isTeamWin
    ? allPlayers.filter(p => p.teamId === state.winnerTeamId && p.alive)
    : [];

  // ── Title ───────────────────────────────────────────
  const title = new TextDisplayBuilder()
    .setContent(`🏆 **${strings.gameOverTitle}**`);

  // ── Winner / Draw description ───────────────────────
  let description: string;
  if (isTeamWin && teamWinners.length > 0) {
    const names = teamWinners.map(p => p.username).join(' & ');
    description =
      strings.gameOverTeamWinner(names) + '\n\n' +
      strings.gameOverTeamWinnerStats(teamWinners.length, state.round);
  } else if (winner) {
    description =
      strings.gameOverWinner(winner.username) + '\n\n' +
      strings.gameOverWinnerStats(winner.roundsSurvived, winner.damageDealt, winner.kills);
  } else {
    description = strings.gameOverNoSurvivors;
  }

  const descSection = new TextDisplayBuilder()
    .setContent(description);

  // ── Leaderboard ─────────────────────────────────────
  const sorted = [...allPlayers].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.kills - a.kills || b.damageDealt - a.damageDealt;
  });

  const leaderboard = sorted.slice(0, 10).map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const status = p.alive ? '💚' : '💀';
    return `${medal} ${status} **${p.username}** — ${p.kills} ${strings.kills}, ${p.damageDealt} ${strings.dmg}, ${p.roundsSurvived} ${strings.rounds}`;
  });

  const leaderboardSection = new TextDisplayBuilder()
    .setContent(`**${strings.gameOverLeaderboard}**\n${leaderboard.join('\n')}`);

  // ── Match stats ─────────────────────────────────────
  const duration = state.endedAt && state.startedAt
    ? Math.floor((state.endedAt - state.startedAt) / 1000)
    : 0;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  const statsSection = new TextDisplayBuilder()
    .setContent(
      `**${strings.gameOverStats}**\n` +
      `${strings.gameOverDuration}: ${minutes}m ${seconds}s\n` +
      `${strings.gameOverRounds}: ${state.round}\n` +
      `${strings.gameOverPlayersLabel}: ${allPlayers.length}\n` +
      `${strings.gameOverTotalDeaths}: ${allPlayers.filter(p => !p.alive).length}`
    );

  const footer = new TextDisplayBuilder()
    .setContent(`🎲 ${strings.lobbyMatch}: \`${state.matchId}\``);

  // ── Assemble container ──────────────────────────────
  const container = new ContainerBuilder()
    .addTextDisplayComponents(title)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(descSection)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(leaderboardSection)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(statsSection)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(footer);

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
}
