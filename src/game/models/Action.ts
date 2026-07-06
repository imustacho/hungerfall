/**
 * All possible player actions.
 * Discriminated union — each action has a unique `type` field.
 */
export type Action =
  | AttackAction
  | DefendAction
  | HideAction
  | MoveAction
  | SearchAction
  | HealAction
  | HelpTeammateAction
  | BetrayTeammateAction;

export interface AttackAction {
  readonly type: 'attack';
  /** Target player ID */
  targetId: string;
}

export interface DefendAction {
  readonly type: 'defend';
}

export interface HideAction {
  readonly type: 'hide';
}

export interface MoveAction {
  readonly type: 'move';
}

export interface SearchAction {
  readonly type: 'search';
}

export interface HealAction {
  readonly type: 'heal';
}

export interface HelpTeammateAction {
  readonly type: 'help_teammate';
  /** Teammate player ID to help */
  targetId: string;
}

export interface BetrayTeammateAction {
  readonly type: 'betray_teammate';
  /** Teammate player ID to betray */
  targetId: string;
}

/** All action type identifiers */
export type ActionType = Action['type'];

/** Actions that require a target selection step */
export type TargetedActionType = 'attack' | 'help_teammate' | 'betray_teammate';

/** Actions that execute immediately (no second step) */
export type ImmediateActionType = 'defend' | 'hide' | 'move' | 'search' | 'heal';

/**
 * Metadata about each action type for display and logic.
 */
export interface ActionDefinition {
  type: ActionType;
  label: string;
  emoji: string;
  description: string;
  requiresTarget: boolean;
  /** What kind of targets can be selected */
  targetFilter: 'enemies' | 'teammates' | 'none';
}

export const ACTION_DEFINITIONS: Record<ActionType, ActionDefinition> = {
  attack: {
    type: 'attack',
    label: 'Attack',
    emoji: '⚔️',
    description: 'Strike another player',
    requiresTarget: true,
    targetFilter: 'enemies',
  },
  defend: {
    type: 'defend',
    label: 'Defend',
    emoji: '🛡️',
    description: 'Brace for incoming attacks, reducing damage',
    requiresTarget: false,
    targetFilter: 'none',
  },
  hide: {
    type: 'hide',
    label: 'Hide',
    emoji: '🌿',
    description: 'Conceal yourself to avoid attacks',
    requiresTarget: false,
    targetFilter: 'none',
  },
  move: {
    type: 'move',
    label: 'Move',
    emoji: '🏃',
    description: 'Reposition to gain a tactical advantage',
    requiresTarget: false,
    targetFilter: 'none',
  },
  search: {
    type: 'search',
    label: 'Search',
    emoji: '🔍',
    description: 'Search the area for useful items',
    requiresTarget: false,
    targetFilter: 'none',
  },
  heal: {
    type: 'heal',
    label: 'Heal',
    emoji: '❤️‍🩹',
    description: 'Tend to your wounds and recover HP',
    requiresTarget: false,
    targetFilter: 'none',
  },
  help_teammate: {
    type: 'help_teammate',
    label: 'Help Teammate',
    emoji: '🤝',
    description: 'Assist a teammate, boosting their abilities',
    requiresTarget: true,
    targetFilter: 'teammates',
  },
  betray_teammate: {
    type: 'betray_teammate',
    label: 'Betray Teammate',
    emoji: '🗡️',
    description: 'Turn on your teammate with a surprise attack',
    requiresTarget: true,
    targetFilter: 'teammates',
  },
};

/**
 * Default action when a player doesn't respond in time.
 */
export const DEFAULT_ACTION: DefendAction = { type: 'defend' };
