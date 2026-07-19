import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMemberRoleManager,
} from 'discord.js';
import { getSessionManager } from '../session/SessionManager.js';
import { getLocale } from '../i18n/index.js';
import { LANGUAGE_NAMES, Language } from '../i18n/types.js';
import { createLogger } from '../utils/logger.js';
import { interactionQueue } from '../utils/InteractionQueue.js';
import { GameSession } from '../session/GameSession.js';
import { LobbyError, isDatabaseError } from '../utils/errors.js';

const log = createLogger('ButtonHandler');

/**
 * Routes button interactions to the appropriate handler based on customId prefix.
 */
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  let session: GameSession | undefined;

  try {
    const sessionManager = getSessionManager();

    if (customId.startsWith('lobby_')) {
      // lobby_lang_ buttons are ephemeral follow-ups — session is found via channelId encoded in customId
      if (customId.startsWith('lobby_lang_')) {
        await handleLanguageSelection(interaction);
        return;
      }

      if (customId.startsWith('lobby_team_accept_') || customId.startsWith('lobby_team_decline_')) {
        const parts = customId.split('_');
        const targetChannelId = parts.slice(3).join('_');
        session = sessionManager.getSession(targetChannelId);
      } else {
        session = sessionManager.getSession(interaction.channelId);
      }

      if (!session) {
        const strings = getLocale();
        await interaction.reply({
          content: `❌ ${strings.errNoActiveGame}`,
          ephemeral: true,
        });
        return;
      }
    } else if (customId.startsWith('action_')) {
      session = sessionManager.getSessionByPlayer(interaction.user.id);
      if (!session) {
        const strings = getLocale();
        await interaction.reply({
          content: `❌ ${strings.errNotInGame}`,
          ephemeral: true,
        });
        return;
      }
    }

    if (session) {
      // Defer immediately to prevent interaction timeout.
      // After a bot restart, stale interactions from the previous instance may arrive
      // with expired tokens (Discord error 10062). We silently skip these.
      try {
        await interaction.deferUpdate();
      } catch (err: any) {
        if (err?.code === 10062) {
          log.debug(`Ignoring stale interaction ${customId} (expired before restart)`);
          return;
        }
        throw err;
      }

      // Enqueue the interaction handler to prevent race conditions
      await interactionQueue.enqueue(session.getState().channelId, async () => {
        try {
          if (customId.startsWith('lobby_')) {
            await handleLobbyButton(interaction, session!);
          } else if (customId.startsWith('action_')) {
            await handleActionButton(interaction, session!);
          }
        } catch (error) {
          // Handle known lobby/game errors gracefully inside the queue
          if (error instanceof LobbyError) {
            log.warn(`Lobby action rejected for ${customId}: ${error.code} - ${error.message}`);
            try {
              await interaction.followUp({ content: `❌ ${error.message}`, ephemeral: true });
            } catch {
              // followUp may fail if interaction expired
            }
          } else {
            // Re-throw unknown errors so the outer catch can handle them
            throw error;
          }
        }
      });
      return;
    }

    log.warn(`Unknown button customId: ${customId}`);
  } catch (error) {
    log.error(`Button handler error for ${customId}`, error);
    try {
      const strings = getLocale(session?.getState().language);
      const message = isDatabaseError(error) ? strings.errDatabase : `❌ ${error instanceof Error ? error.message : 'Something went wrong.'}`;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    } catch {
      // Interaction may have timed out
    }
  }
}

/**
 * Handles lobby-related button clicks (join, leave, start, team).
 */
async function handleLobbyButton(interaction: ButtonInteraction, session: GameSession): Promise<void> {
  const strings = getLocale(session.getState().language);
  const lobby = session.getLobbyManager();
  const action = interaction.customId.replace('lobby_', '');
  let actionName = action;
  if (action.startsWith('team_accept_')) {
    actionName = 'team_accept';
  } else if (action.startsWith('team_decline_')) {
    actionName = 'team_decline';
  }

  switch (actionName) {
    case 'join': {
      // Role gate check
      const requiredRoleId = session.getState().requiredRoleId;
      if (requiredRoleId) {
        const member = interaction.member;
        const hasRole = member?.roles instanceof Object
          && 'cache' in (member.roles as any)
          ? (member.roles as GuildMemberRoleManager).cache.has(requiredRoleId)
          : false;

        if (!hasRole) {
          await interaction.followUp({
            content: strings.errRoleMissing(requiredRoleId),
            ephemeral: true,
          });
          return;
        }
      }

      // Check if user already has a language preference stored
      const storage = getSessionManager().getStorage();
      const savedLanguage = await storage.getUserLanguage(interaction.user.id);

      if (savedLanguage) {
        // User already has a preference — join immediately with their saved language
        lobby.addPlayer(interaction.user.id, interaction.user.displayName, savedLanguage);
        await lobby.updateLobbyMessage();
        await session.saveActiveState();
      } else {
        // No saved preference — show language selection buttons
        const langRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`lobby_lang_en_${interaction.channelId}`)
            .setLabel('English')
            .setEmoji('🇬🇧')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`lobby_lang_tr_${interaction.channelId}`)
            .setLabel('Türkçe')
            .setEmoji('🇹🇷')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`lobby_lang_de_${interaction.channelId}`)
            .setLabel('Deutsch')
            .setEmoji('🇩🇪')
            .setStyle(ButtonStyle.Secondary),
        );

        await interaction.followUp({
          content: '🌍 **Which language would you like for your DMs?**\n*Hangi dilde DM almak istiyorsunuz? / In welcher Sprache möchten Sie DMs erhalten?*',
          components: [langRow],
          ephemeral: true,
        });
      }
      break;
    }

    case 'leave': {
      lobby.removePlayer(interaction.user.id);
      await lobby.updateLobbyMessage();
      await session.saveActiveState();
      break;
    }

    case 'start': {
      // Only the lobby creator can start the game
      const creatorId = session.getState().creatorId;
      if (interaction.user.id !== creatorId) {
        await interaction.followUp({
          content: `❌ ${strings.errOnlyPlayersStart}`,
          ephemeral: true,
        });
        return;
      }

      await session.startGame();
      break;
    }

    case 'team': {
      // Show a select menu of available players to invite
      const targets = lobby.getAvailableTeamTargets(interaction.user.id);

      if (targets.length === 0) {
        await interaction.followUp({
          content: `❌ ${strings.errNotInGame}`,
          ephemeral: true,
        });
        return;
      }

      const { StringSelectMenuBuilder, ActionRowBuilder: ActionRow } = await import('discord.js');
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`team_invite_select_${interaction.channelId}`)
        .setPlaceholder(strings.teamSelectPlaceholder)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          targets.map(t => ({
            label: t.username,
            value: t.id,
          }))
        );

      const selectRow = new ActionRow<typeof selectMenu>().addComponents(selectMenu);

      await interaction.followUp({
        content: strings.teamSelectTarget,
        components: [selectRow],
        ephemeral: true,
      });
      break;
    }

    case 'team_accept': {
      const result = lobby.acceptTeamInvite(interaction.user.id);
      await lobby.updateLobbyMessage();
      await session.saveActiveState();

      await interaction.editReply({
        content: strings.teamInviteAccepted(result.partnerName),
        components: [],
      });

      // Notify the inviter
      try {
        const inviter = session.getState().players.get(result.partnerId);
        if (inviter) {
          const inviterStrings = getLocale(inviter.language);
          const user = await interaction.client.users.fetch(result.partnerId);
          const dm = await user.createDM();
          await dm.send({ content: inviterStrings.teamInviteAccepted(interaction.user.displayName) });
        }
      } catch {
        // DM to inviter may fail — not critical
      }
      break;
    }

    case 'team_decline': {
      const result = lobby.declineTeamInvite(interaction.user.id);
      await session.saveActiveState();

      const inviter = session.getState().players.get(result.inviterId);
      const inviterName = inviter ? inviter.username : 'Unknown';

      await interaction.editReply({
        content: strings.teamInviteDeclinedRecipient(inviterName),
        components: [],
      });

      // Notify the inviter
      try {
        const inviterPlayer = session.getState().players.get(result.inviterId);
        if (inviterPlayer) {
          const inviterStrings = getLocale(inviterPlayer.language);
          const user = await interaction.client.users.fetch(result.inviterId);
          const dm = await user.createDM();
          await dm.send({ content: inviterStrings.teamInviteDeclined(interaction.user.displayName) });
        }
      } catch {
        // DM to inviter may fail — not critical
      }
      break;
    }

    default:
      log.warn(`Unknown lobby action: ${action}`);
  }
}

/**
 * Handles language selection when a user clicks a language button before joining the lobby.
 * customId format: lobby_lang_{lang}_{channelId}
 */
async function handleLanguageSelection(interaction: ButtonInteraction): Promise<void> {
  // Parse customId: lobby_lang_{lang}_{channelId}
  const parts = interaction.customId.split('_');
  // parts = ['lobby', 'lang', 'en', '123456789']
  const selectedLang = parts[2] as Language;
  const channelId = parts.slice(3).join('_'); // channelId may contain underscores (unlikely but safe)

  const sessionManager = getSessionManager();
  const session = sessionManager.getSession(channelId);

  if (!session) {
    const strings = getLocale();
    await interaction.reply({
      content: `❌ ${strings.errNoActiveGame}`,
      ephemeral: true,
    });
    return;
  }

  // Defer to prevent timeout
  try {
    await interaction.deferUpdate();
  } catch (err: any) {
    if (err?.code === 10062) {
      log.debug(`Ignoring stale language selection interaction (expired before restart)`);
      return;
    }
    throw err;
  }

  await interactionQueue.enqueue(channelId, async () => {
    try {
      const lobby = session.getLobbyManager();
      const storage = sessionManager.getStorage();

      // Save user's language preference to the database
      await storage.setUserLanguage(interaction.user.id, selectedLang);

      // Join the lobby with the selected language
      lobby.addPlayer(interaction.user.id, interaction.user.displayName, selectedLang);
      await lobby.updateLobbyMessage();
      await session.saveActiveState();

      const langName = LANGUAGE_NAMES[selectedLang] || selectedLang;
      await interaction.followUp({
        content: `✅ **${langName}** — OK!`,
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof LobbyError) {
        log.warn(`Language selection join rejected: ${error.code} - ${error.message}`);
        try {
          await interaction.followUp({ content: `❌ ${error.message}`, ephemeral: true });
        } catch {
          // followUp may fail
        }
      } else {
        throw error;
      }
    }
  });
}

/**
 * Handles action button clicks in DMs (player action choices).
 */
async function handleActionButton(interaction: ButtonInteraction, session: GameSession): Promise<void> {
  const actionType = interaction.customId.replace('action_', '');

  // Route direct item-use actions (they don't consume the round action)
  if (actionType.startsWith('use_item_')) {
    const itemId = actionType.replace('use_item_', '');
    await session.handleItemUseDirect(interaction, itemId);
    return;
  }

  await session.handleActionChoice(interaction, actionType);
}
