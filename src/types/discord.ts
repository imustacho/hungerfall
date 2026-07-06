/**
 * Shared types used across the Discord interaction layer.
 */
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';

/**
 * Defines a slash command that the bot handles.
 */
export interface BotCommand {
  /** Command data for registration with Discord */
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  /** Handler function called when the command is used */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
