import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { Player } from '../game/models/Player.js';
import { Item } from '../game/models/Item.js';
import { ActionType, ACTION_DEFINITIONS, TargetedActionType } from '../game/models/Action.js';
import { GAME_CONSTANTS } from '../game/constants.js';
import { getLocale, LocaleStrings } from '../i18n/index.js';

function getActionLabel(actionType: string, strings: LocaleStrings): string {
  switch (actionType) {
    case 'attack': return strings.actionAttack;
    case 'defend': return strings.actionDefend;
    case 'hide': return strings.actionHide;
    case 'move': return strings.actionMove;
    case 'search': return strings.actionSearch;
    case 'heal': return strings.actionHeal;
    case 'help_teammate': return strings.actionHelpTeammate;
    case 'betray_teammate': return strings.actionBetrayTeammate;
    default: return actionType;
  }
}

/**
 * Renders DM action choice messages using Components V2.
 */

/**
 * Renders the initial action selection DM.
 */
export function renderActionChoice(
  player: Player,
  roundNumber: number,
  allPlayers: Player[],
  language: string,
): { components: any[]; flags: any } {
  const strings = getLocale(language);
  const title = new TextDisplayBuilder()
    .setContent(strings.dmRoundTitle(roundNumber));

  const statusText = [
    `❤️ **${strings.dmHP}:** ${player.hp}/${player.maxHp}`,
    `🎒 **${strings.dmItems}:** ${player.inventory.length > 0 ? player.inventory.map(i => i.name).join(', ') : strings.dmNone}`,
    player.statusEffects.length > 0
      ? `✨ **${strings.dmEffects}:** ${player.statusEffects.map(e => e.type).join(', ')}`
      : null,
    player.teamId ? `🏷️ **${strings.dmTeam}:** ${player.teamId}` : null,
  ].filter(Boolean).join('\n');

  const info = new TextDisplayBuilder().setContent(statusText);

  const prompt = new TextDisplayBuilder()
    .setContent(strings.dmChooseAction(GAME_CONSTANTS.ACTION_TIMEOUT_MS / 1000));

  // Build action buttons — first row (4 max per row)
  const row1Actions: ActionType[] = ['attack', 'defend', 'hide', 'move'];
  const row2Actions: ActionType[] = ['search', 'heal'];

  // Add team actions if player has a team
  if (player.teamId) {
    row2Actions.push('help_teammate', 'betray_teammate');
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...row1Actions.map(actionType => {
      const def = ACTION_DEFINITIONS[actionType];
      return new ButtonBuilder()
        .setCustomId(`action_${actionType}`)
        .setLabel(getActionLabel(actionType, strings))
        .setEmoji(def.emoji)
        .setStyle(actionType === 'attack' ? ButtonStyle.Danger : ButtonStyle.Secondary);
    })
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...row2Actions.map(actionType => {
      const def = ACTION_DEFINITIONS[actionType];
      return new ButtonBuilder()
        .setCustomId(`action_${actionType}`)
        .setLabel(getActionLabel(actionType, strings))
        .setEmoji(def.emoji)
        .setStyle(
          actionType === 'betray_teammate' ? ButtonStyle.Danger
            : actionType === 'heal' ? ButtonStyle.Success
              : ButtonStyle.Secondary
        );
    })
  );

  // Row 3: Direct item use buttons (one per item in player's inventory)
  const itemRows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (player.inventory.length > 0) {
    const isTurkish = language === 'tr';
    const isGerman = language === 'de';
    const usePrefix = isTurkish ? 'Kullan:' : isGerman ? 'Nutzen:' : 'Use:';

    // Map each item to a button. Discord supports up to 5 buttons per row.
    const itemButtons = player.inventory.map(item => {
      let emoji = '🎒';
      if (item.type === 'weapon') emoji = '⚔️';
      else if (item.type === 'armor') emoji = '🛡️';
      else if (item.type === 'consumable') emoji = '🧪';
      else if (item.type === 'special') emoji = '✨';

      return new ButtonBuilder()
        .setCustomId(`action_use_item_${item.id}`)
        .setLabel(`${usePrefix} ${item.name}`)
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Primary);
    });

    // Chunk into action rows of max 5 buttons
    for (let i = 0; i < itemButtons.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...itemButtons.slice(i, i + 5)
      );
      itemRows.push(row);
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(title)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(info)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(prompt)
    .addActionRowComponents(row1)
    .addActionRowComponents(row2);

  // Add the item button rows if present
  for (const row of itemRows) {
    container.addActionRowComponents(row);
  }

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
}


/**
 * Renders a target selection message for actions that require a target.
 */
export function renderTargetSelection(
  actionType: TargetedActionType,
  player: Player,
  targets: Player[],
  language: string,
): { components: any[]; flags: any } {
  const strings = getLocale(language);
  const def = ACTION_DEFINITIONS[actionType];

  const title = new TextDisplayBuilder()
    .setContent(`### ${def.emoji} ${getActionLabel(actionType, strings)} — ${strings.dmTargetChoose}`);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`target_${actionType}`)
    .setPlaceholder('Select a target...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      targets.map(target => ({
        label: target.username,
        value: target.id,
        description: `${strings.dmHP}: ${target.hp}/${target.maxHp}${target.teamId ? ` | Team ${target.teamId}` : ''}`,
        emoji: target.hp > target.maxHp * 0.5 ? '💚' : target.hp > target.maxHp * 0.25 ? '💛' : '❤️',
      }))
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(title)
    .addActionRowComponents(selectRow);

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
}

/**
 * Renders a confirmation that the action was received.
 */
export function renderActionConfirmation(actionType: ActionType, targetName?: string, language: string = 'en'): { components: any[]; flags: any } {
  const strings = getLocale(language);
  const def = ACTION_DEFINITIONS[actionType];
  const targetText = targetName ? ` → **${targetName}**` : '';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${strings.dmActionConfirmTitle}\n${def.emoji} **${getActionLabel(actionType, strings)}**${targetText}\n\n${strings.dmActionConfirmWaiting}`
      )
    );

  return {
    components: [container],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
}
