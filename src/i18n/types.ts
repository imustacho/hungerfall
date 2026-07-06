/**
 * Supported languages for the bot and AI narrator.
 */
export type Language = 'en' | 'tr' | 'de';

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  tr: 'Türkçe',
  de: 'Deutsch',
};

export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * All localizable strings used across the bot.
 * Every UI-facing string goes here — no hardcoded text in components.
 */
export interface LocaleStrings {
  // ── General ─────────────────────────────────────────
  langName: string;

  // ── Lobby ───────────────────────────────────────────
  lobbyTitle: string;
  lobbySubtitle: string;
  lobbyStatusWaiting: string;
  lobbyStatusActive: string;
  lobbyStatusFinished: string;
  lobbyStatus: string;
  lobbyPlayers: string;
  lobbyMatch: string;
  lobbyPlayerListHeader: string;
  lobbyNoPlayers: string;
  lobbyTeamBadge: (teamId: string) => string;
  lobbyBtnJoin: string;
  lobbyBtnLeave: string;
  lobbyBtnStart: string;
  lobbyBtnTeam: string;
  lobbyInProgress: string;
  lobbyRound: string;
  lobbyAlive: string;
  lobbyWatchChannel: string;

  // ── Lobby errors ────────────────────────────────────
  errGameRunning: string;
  errAlreadyJoined: string;
  errLobbyFull: string;
  errGameStarted: string;
  errNotInGame: string;
  errAlreadyInTeam: string;
  errCannotStart: string;
  errOnlyPlayersStart: string;
  errNoActiveGame: string;

  // ── Lobby feedback ──────────────────────────────────
  teamSearching: string;
  teamFormed: (partnerName: string) => string;

  // ── Game start ──────────────────────────────────────
  gameStartTitle: string;
  gameStartDesc: (playerCount: number) => string;

  // ── DM Actions ──────────────────────────────────────
  dmRoundTitle: (round: number) => string;
  dmHP: string;
  dmItems: string;
  dmEffects: string;
  dmTeam: string;
  dmNone: string;
  dmChooseAction: (seconds: number) => string;
  dmActionConfirmTitle: string;
  dmActionConfirmWaiting: string;
  dmTargetChoose: string;
  dmTimeout: string;

  // ── Action names ────────────────────────────────────
  actionAttack: string;
  actionDefend: string;
  actionHide: string;
  actionMove: string;
  actionSearch: string;
  actionHeal: string;
  actionHelpTeammate: string;
  actionBetrayTeammate: string;
  actionUseItem: string;

  // ── Item usage ──────────────────────────────────────
  dmNoItems: string;
  dmItemSelectPlaceholder: string;
  dmItemUsed: (itemName: string, effect: string) => string;
  dmItemNotUsable: string;

  // ── Action descriptions ─────────────────────────────
  descAttack: string;
  descDefend: string;
  descHide: string;
  descMove: string;
  descSearch: string;
  descHeal: string;
  descHelpTeammate: string;
  descBetrayTeammate: string;

  // ── Round summary ───────────────────────────────────
  roundTitle: (round: number) => string;
  roundDeathsHeader: string;
  roundDeathKilled: (victim: string, killer: string) => string;
  roundDeathPerished: (victim: string) => string;
  roundHPHeader: string;
  roundItemsHeader: string;
  roundItemFound: (player: string, item: string) => string;
  roundFooter: (alive: number, matchId: string) => string;
  roundNotice: (round: number) => string;
  roundCheckDMs: string;

  // ── Game over ───────────────────────────────────────
  gameOverTitle: string;
  gameOverWinner: (name: string) => string;
  gameOverWinnerStats: (rounds: number, damage: number, kills: number) => string;
  gameOverNoSurvivors: string;
  gameOverLeaderboard: string;
  gameOverStats: string;
  gameOverDuration: string;
  gameOverRounds: string;
  gameOverPlayersLabel: string;
  gameOverTotalDeaths: string;

  // ── Fallback narrator ───────────────────────────────
  narratorAttack: (attacker: string, target: string, damage: number) => string;
  narratorAttackDefended: (attacker: string, target: string, damage: number) => string;
  narratorDeathByKill: (victim: string, killer: string) => string;
  narratorDeathByWounds: (victim: string) => string;
  narratorHeal: (player: string, amount: number) => string;
  narratorDefend: (player: string) => string;
  narratorHide: (player: string) => string;
  narratorMove: (player: string) => string;
  narratorItemFound: (player: string, item: string) => string;
  narratorEvasion: (attacker: string, evader: string) => string;
  narratorHelp: (helper: string, helped: string) => string;
  narratorBetray: (betrayer: string, betrayed: string, damage: number) => string;
  narratorStatusDamage: (player: string, amount: number, status: string) => string;
  narratorRemaining: (count: number) => string;
  narratorUneventful: string;

  // ── AI Narrator language instruction ────────────────
  narratorLanguageInstruction: string;

  // ── Misc ────────────────────────────────────────────
  errorGeneric: string;
  errorOccurred: string;
  kills: string;
  dmg: string;
  rounds: string;
}
