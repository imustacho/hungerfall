import { AnySelectMenuInteraction } from 'discord.js';
import { getSessionManager } from '../session/SessionManager.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { interactionQueue } from '../utils/InteractionQueue.js';
import { GameSession } from '../session/GameSession.js';

import { isDatabaseError } from '../utils/errors.js';

const log = createLogger('SelectMenuHandler');

/**
 * Routes select menu interactions (target selection and item use in DMs).
 */
export async function handleSelectMenuInteraction(
  interaction: AnySelectMenuInteraction,
): Promise<void> {
  const customId = interaction.customId;
  let session: GameSession | undefined;

  try {
    // ── Target selection for actions ──────────────────
    if (customId.startsWith('target_')) {
      const sessionManager = getSessionManager();
      session = sessionManager.getSessionByPlayer(interaction.user.id);

      if (!session) {
        const strings = getLocale();
        await interaction.reply({
          content: `❌ ${strings.errNotInGame}`,
          ephemeral: true,
        });
        return;
      }

      // Defer immediately to prevent interaction timeout.
      // After a bot restart, stale interactions may arrive with expired tokens.
      try {
        await interaction.deferUpdate();
      } catch (err: any) {
        if (err?.code === 10062) {
          log.debug(`Ignoring stale interaction ${customId} (expired before restart)`);
          return;
        }
        throw err;
      }

      // Enqueue target selection processing
      await interactionQueue.enqueue(session.getState().channelId, async () => {
        await handleTargetSelection(interaction, session!);
      });
      return;
    }

    log.warn(`Unknown select menu customId: ${customId}`);
  } catch (error) {
    log.error(`Select menu handler error for ${customId}`, error);
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
 * Handles target selection from a select menu in DMs.
 */
async function handleTargetSelection(
  interaction: AnySelectMenuInteraction,
  session: GameSession,
): Promise<void> {
  const actionType = interaction.customId.replace('target_', '');
  const strings = getLocale(session.getState().language);

  // Get the selected target ID
  const targetId = interaction.isStringSelectMenu()
    ? interaction.values[0]
    : interaction.isUserSelectMenu()
      ? interaction.users.first()?.id
      : undefined;

  if (!targetId) {
    await interaction.followUp({
      content: strings.errInvalidTarget,
      ephemeral: true,
    });
    return;
  }

  await session.handleTargetChoice(interaction, actionType, targetId);
}

