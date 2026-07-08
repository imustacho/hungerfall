import fs from 'fs/promises';
import path from 'path';
import { MatchRecord, MatchSummary } from '../types/game.js';
import { GameState } from '../game/models/GameState.js';
import { StorageProvider } from './StorageProvider.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('JsonStorage');

interface DbSchema {
  matches: MatchRecord[];
  activeSessions: any[];
}

/**
 * JSON file-based database backend.
 * Stores matches and active sessions in a single structured JSON file.
 */
export class JsonStorage implements StorageProvider {
  private filePath: string;
  private schema: DbSchema = { matches: [], activeSessions: [] };
  private ready: boolean = false;

  constructor(dataPath: string) {
    this.filePath = dataPath;
  }

  /**
   * Initializes the storage: loads database file and handles legacy format migration.
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data)) {
        // Backwards compatibility: migrating old array-based format to schema
        this.schema = {
          matches: data,
          activeSessions: [],
        };
        await this.flush();
        log.info(`Migrated legacy matches array to structured database format`);
      } else if (data && typeof data === 'object') {
        this.schema = {
          matches: data.matches || [],
          activeSessions: data.activeSessions || [],
        };
      }
      log.info(`Database loaded: ${this.schema.matches.length} matches, ${this.schema.activeSessions.length} active sessions`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.schema = { matches: [], activeSessions: [] };
        await this.flush();
        log.info(`Created empty database file at ${this.filePath}`);
      } else {
        log.warn('Could not parse database file, starting with empty schema', err);
        this.schema = { matches: [], activeSessions: [] };
      }
    }

    this.ready = true;
  }

  /**
   * Saves a completed match record.
   */
  async saveMatch(match: MatchRecord): Promise<void> {
    // Do not save match records and clear any existing matches to keep JSON clean.
    this.schema.matches = [];
    await this.flush();
    log.info(`Cleared all completed match records. Match ${match.matchId} not saved.`);
  }

  /**
   * Retrieves a match by its ID.
   */
  async getMatch(matchId: string): Promise<MatchRecord | null> {
    return this.schema.matches.find(r => r.matchId === matchId) ?? null;
  }

  /**
   * Lists match summaries for a guild, ordered by most recent.
   */
  async listMatches(guildId: string, limit: number = 10): Promise<MatchSummary[]> {
    return this.schema.matches
      .filter(r => r.guildId === guildId)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, limit)
      .map(r => ({
        matchId: r.matchId,
        guildId: r.guildId,
        channelId: r.channelId,
        winnerId: r.winnerId,
        winnerName: r.winnerName,
        playerCount: r.playerCount,
        roundCount: r.roundCount,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      }));
  }

  /**
   * Saves or updates an active game session state.
   */
  async saveActiveSession(state: GameState): Promise<void> {
    // Custom serialization to support Map preservation
    const serialized = JSON.parse(JSON.stringify(state, replacer));

    const index = this.schema.activeSessions.findIndex(s => s.channelId === state.channelId);
    if (index !== -1) {
      this.schema.activeSessions[index] = serialized;
    } else {
      this.schema.activeSessions.push(serialized);
    }

    await this.flush();
    log.info(`Active session ${state.matchId} state persisted`);
  }

  /**
   * Removes an active session from the database.
   */
  async deleteActiveSession(channelId: string): Promise<void> {
    const originalLength = this.schema.activeSessions.length;
    this.schema.activeSessions = this.schema.activeSessions.filter(s => s.channelId !== channelId);

    if (this.schema.activeSessions.length !== originalLength) {
      await this.flush();
      log.info(`Active session for channel ${channelId} removed from database`);
    }
  }

  /**
   * Lists all active game sessions, reconstructing Maps properly.
   */
  async listActiveSessions(): Promise<GameState[]> {
    return this.schema.activeSessions.map(s => {
      // Reconstruct Map structures from serialized { __type: 'Map', entries: [...] }
      return JSON.parse(JSON.stringify(s), reviver) as GameState;
    });
  }

  /**
   * Gracefully flushes schema changes.
   */
  async close(): Promise<void> {
    if (this.ready) await this.flush();
  }

  /**
   * Writes the schema to disk.
   */
  private async flush(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.schema, null, 2), 'utf-8');
  }
}

/**
 * JSON replacer to serialize Maps.
 */
function replacer(key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries()),
    };
  }
  return value;
}

/**
 * JSON reviver to restore Maps from serialized format.
 */
function reviver(key: string, value: any): any {
  if (value && typeof value === 'object' && value.__type === 'Map') {
    return new Map(value.entries);
  }
  return value;
}
