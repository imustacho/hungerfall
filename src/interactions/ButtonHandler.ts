import { ButtonInteraction, GuildMemberRoleManager } from 'discord.js';
import { getSessionManager } from '../session/SessionManager.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ButtonHandler');

/**
 * Routes button interactions to the appropriate handler based on customId prefix.
 */
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    // ── Lobby buttons ─────────────────────────────────
    if (customId.startsWith('lobby_')) {
      await handleLobbyButton(interaction);
      return;
    }

    // ── Action buttons (DM choices) ───────────────────
    if (customId.startsWith('action_')) {
      await handleActionButton(interaction);
      return;
    }

    log.warn(`Unknown button customId: ${customId}`);
  } catch (error) {
    log.error(`Button handler error for ${customId}`, error);
    try {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
    } catch {
      // Interaction may have timed out
    }
  }
}

/**
 * Handles lobby-related button clicks (join, leave, start, team).
 */
async function handleLobbyButton(interaction: ButtonInteraction): Promise<void> {
  const sessionManager = getSessionManager();
  const channelId = interaction.channelId;
  const session = sessionManager.getSession(channelId);

  if (!session) {
    await interaction.reply({
      content: '❌ No active game in this channel.',
      ephemeral: true,
    });
    return;
  }

  const strings = getLocale(session.getState().language);

  const lobby = session.getLobbyManager();
  const action = interaction.customId.replace('lobby_', '');

  switch (action) {
    case 'join': {
      try {
        // Role gate check
        const requiredRoleId = session.getState().requiredRoleId;
        if (requiredRoleId) {
          const member = interaction.member;
          const hasRole = member?.roles instanceof Object
            && 'cache' in (member.roles as any)
            ? (member.roles as GuildMemberRoleManager).cache.has(requiredRoleId)
            : false;

          if (!hasRole) {
            await interaction.reply({
              content: `❌ You need the <@&${requiredRoleId}> role to join this game.`,
              ephemeral: true,
            });
            return;
          }
        }

        lobby.addPlayer(interaction.user.id, interaction.user.displayName);
        await interaction.deferUpdate();
        await lobby.updateLobbyMessage();
        await session.saveActiveState();
      } catch (error) {
        const message = error instanceof Error ? error.message : strings.errorGeneric;
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
      break;
    }

    case 'leave': {
      try {
        lobby.removePlayer(interaction.user.id);
        await interaction.deferUpdate();
        await lobby.updateLobbyMessage();
        await session.saveActiveState();
      } catch (error) {
        const message = error instanceof Error ? error.message : strings.errorGeneric;
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
      break;
    }

    case 'start': {
      try {
        // Only the lobby creator can start the game
        const creatorId = session.getState().creatorId;
        if (interaction.user.id !== creatorId) {
          await interaction.reply({
            content: `❌ ${strings.errOnlyPlayersStart}`,
            ephemeral: true,
          });
          return;
        }

        await interaction.deferUpdate();
        await session.startGame();
      } catch (error) {
        const message = error instanceof Error ? error.message : strings.errorGeneric;
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
      break;
    }

    case 'team': {
      try {
        const result = lobby.requestTeam(interaction.user.id);
        await interaction.deferUpdate();

        if (result.formed) {
          await lobby.updateLobbyMessage();
        } else {
          await lobby.updateLobbyMessage();
          // Notify user they're waiting
          await interaction.followUp({
            content: strings.teamSearching,
            ephemeral: true,
          });
        }
        await session.saveActiveState();
      } catch (error) {
        const message = error instanceof Error ? error.message : strings.errorGeneric;
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
      break;
    }

    default:
      log.warn(`Unknown lobby action: ${action}`);
  }
}

/**
 * Handles action button clicks in DMs (player action choices).
 */
async function handleActionButton(interaction: ButtonInteraction): Promise<void> {
  const actionType = interaction.customId.replace('action_', '');
  const sessionManager = getSessionManager();

  // Find the session this player is in
  const session = sessionManager.getSessionByPlayer(interaction.user.id);

  if (!session) {
    await interaction.reply({
      content: '❌ You are not in an active game.',
      ephemeral: true,
    });
    return;
  }

  // Route direct item-use actions (they don't consume the round action)
  if (actionType.startsWith('use_item_')) {
    const itemId = actionType.replace('use_item_', '');
    await session.handleItemUseDirect(interaction, itemId);
    return;
  }

  await session.handleActionChoice(interaction, actionType);
}
