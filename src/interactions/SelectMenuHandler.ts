import { AnySelectMenuInteraction } from 'discord.js';
import { getSessionManager } from '../session/SessionManager.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SelectMenuHandler');

/**
 * Routes select menu interactions (target selection and item use in DMs).
 */
export async function handleSelectMenuInteraction(
  interaction: AnySelectMenuInteraction,
): Promise<void> {
  const customId = interaction.customId;

  try {
    // ── Target selection for actions ──────────────────
    if (customId.startsWith('target_')) {
      await handleTargetSelection(interaction);
      return;
    }

    log.warn(`Unknown select menu customId: ${customId}`);
  } catch (error) {
    log.error(`Select menu handler error for ${customId}`, error);
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
 * Handles target selection from a select menu in DMs.
 */
async function handleTargetSelection(interaction: AnySelectMenuInteraction): Promise<void> {
  const actionType = interaction.customId.replace('target_', '');
  const sessionManager = getSessionManager();

  const session = sessionManager.getSessionByPlayer(interaction.user.id);

  if (!session) {
    await interaction.reply({
      content: '❌ You are not in an active game.',
      ephemeral: true,
    });
    return;
  }

  const strings = getLocale(session.getState().language);

  // Get the selected target ID
  const targetId = interaction.isStringSelectMenu()
    ? interaction.values[0]
    : interaction.isUserSelectMenu()
      ? interaction.users.first()?.id
      : undefined;

  if (!targetId) {
    await interaction.reply({
      content: `❌ Invalid target selection.`,
      ephemeral: true,
    });
    return;
  }

  await session.handleTargetChoice(interaction, actionType, targetId);
}
