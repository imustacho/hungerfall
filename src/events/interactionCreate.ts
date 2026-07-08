import { Events } from 'discord.js';
import { createLogger } from '../utils/logger.js';
import { ExtendedClient } from '../client.js';
import { handleButtonInteraction } from '../interactions/ButtonHandler.js';
import { handleSelectMenuInteraction } from '../interactions/SelectMenuHandler.js';
import { getLocale } from '../i18n/index.js';

const log = createLogger('Interaction');

/**
 * Central interaction router.
 * Dispatches slash commands, buttons, and select menus to their handlers.
 */
export function registerInteractionEvent(client: ExtendedClient): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ── Slash Commands ──────────────────────────────
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          log.warn(`Unknown command: ${interaction.commandName}`);
          const strings = getLocale();
          await interaction.reply({
            content: strings.errUnknownCommand,
            ephemeral: true,
          });
          return;
        }

        log.info(`Command /${interaction.commandName} by ${interaction.user.tag}`);
        await command.execute(interaction);
        return;
      }

      // ── Buttons ─────────────────────────────────────
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
        return;
      }

      // ── String Select Menus ─────────────────────────
      if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
        return;
      }

      // ── User Select Menus ───────────────────────────
      if (interaction.isUserSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
        return;
      }
    } catch (error) {
      log.error('Unhandled interaction error', error);

      // Try to inform the user
      try {
        const strings = getLocale();
        const reply = { content: strings.errorGeneric, ephemeral: true };
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        }
      } catch {
        // Interaction may have timed out — nothing we can do
      }
    }
  });
}
