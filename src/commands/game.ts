import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMemberRoleManager } from 'discord.js';
import { BotCommand } from '../types/discord.js';
import { getSessionManager } from '../session/SessionManager.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CmdGame');

const gameCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Start a new Hungerfall game in this channel')
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Select the game and narrator language (Default: English)')
        .setRequired(false)
        .addChoices(
          { name: 'English', value: 'en' },
          { name: 'Türkçe', value: 'tr' },
          { name: 'Deutsch', value: 'de' }
        )
    )
    .addRoleOption(option =>
      option.setName('required_role')
        .setDescription('Optional: Only members with this role can join the game')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || !interaction.channelId) {
      const strings = getLocale();
      await interaction.reply({
        content: strings.errServerOnly,
        ephemeral: true,
      });
      return;
    }

    const language = interaction.options.getString('language') || 'en';
    const requiredRole = interaction.options.getRole('required_role');
    const strings = getLocale(language);
    const sessionManager = getSessionManager();

    // Check if the database connection is available
    const storage = sessionManager.getStorage();
    if (storage.isConnected && !storage.isConnected()) {
      await interaction.reply({
        content: strings.errDatabase,
        ephemeral: true,
      });
      return;
    }

    // Check if a game is already active in this channel
    if (sessionManager.hasSession(interaction.channelId)) {
      await interaction.reply({
        content: `❌ ${strings.errGameRunning}`,
        ephemeral: true,
      });
      return;
    }

    try {
      await sessionManager.createSession(
        interaction.channelId,
        interaction.guildId,
        language,
        interaction,
        requiredRole?.id ?? null,
        interaction.user.id,
      );
      log.info(`Game created in channel ${interaction.channelId} by ${interaction.user.tag} in ${language}${requiredRole ? ` (role: ${requiredRole.name})` : ''}`);
    } catch (error) {
      log.error('Failed to create game session', error);
      await interaction.reply({
        content: `❌ ${strings.errorGeneric}`,
        ephemeral: true,
      });
    }
  },
};

export default gameCommand;
