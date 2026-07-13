import mongoose from 'mongoose';
import { MatchRecord, MatchSummary } from '../types/game.js';
import { GameState } from '../game/models/GameState.js';
import { StorageProvider } from './StorageProvider.js';
import { MatchModel } from './models/Match.js';
import { ActiveSessionModel } from './models/ActiveSession.js';
import { UserPreferenceModel } from './models/UserPreference.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MongoStorage');

/**
 * MongoDB storage backend using Mongoose.
 * Replaces the old JSON file-based storage.
 */
export class MongoStorage implements StorageProvider {
  private uri: string;

  constructor(mongoUri: string) {
    this.uri = mongoUri;
  }

  /**
   * Connects to MongoDB.
   */
  async initialize(): Promise<void> {
    try {
      // Disable command buffering globally so that database operations fail immediately
      // when MongoDB is disconnected instead of hanging for 10 seconds.
      mongoose.set('bufferCommands', false);

      await mongoose.connect(this.uri, {
        serverSelectionTimeoutMS: 5000, // Timeout connection attempt after 5 seconds if MongoDB is offline
      });
      log.info(`Connected to MongoDB at ${this.uri}`);
    } catch (error) {
      log.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  /**
   * Disconnects from MongoDB.
   */
  async close(): Promise<void> {
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');
  }

  // ── Match Records ────────────────────────────────────

  /**
   * Saves a completed match record.
   */
  async saveMatch(match: MatchRecord): Promise<void> {
    try {
      await MatchModel.findOneAndUpdate(
        { matchId: match.matchId },
        {
          matchId: match.matchId,
          guildId: match.guildId,
          channelId: match.channelId,
          winnerId: match.winnerId,
          winnerName: match.winnerName,
          playerCount: match.playerCount,
          roundCount: match.roundCount,
          seed: match.seed,
          startedAt: match.startedAt,
          endedAt: match.endedAt,
          fullState: match.fullState,
        },
        { upsert: true, new: true },
      );
      log.info(`Match ${match.matchId} saved to MongoDB`);
    } catch (error) {
      log.error(`Failed to save match ${match.matchId}`, error);
      throw error;
    }
  }

  /**
   * Retrieves a match by its ID.
   */
  async getMatch(matchId: string): Promise<MatchRecord | null> {
    const doc = await MatchModel.findOne({ matchId }).lean();
    if (!doc) return null;

    return {
      matchId: doc.matchId,
      guildId: doc.guildId,
      channelId: doc.channelId,
      winnerId: doc.winnerId,
      winnerName: doc.winnerName,
      playerCount: doc.playerCount,
      roundCount: doc.roundCount,
      seed: doc.seed,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      fullState: doc.fullState,
    };
  }

  /**
   * Lists match summaries for a guild, ordered by most recent.
   */
  async listMatches(guildId: string, limit: number = 10): Promise<MatchSummary[]> {
    const docs = await MatchModel
      .find({ guildId })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();

    return docs.map(doc => ({
      matchId: doc.matchId,
      guildId: doc.guildId,
      channelId: doc.channelId,
      winnerId: doc.winnerId,
      winnerName: doc.winnerName,
      playerCount: doc.playerCount,
      roundCount: doc.roundCount,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
    }));
  }

  // ── Active Sessions ──────────────────────────────────

  /**
   * Saves or updates an active game session state.
   */
  async saveActiveSession(state: GameState): Promise<void> {
    const serialized = JSON.parse(JSON.stringify(state, replacer));

    try {
      await ActiveSessionModel.findOneAndUpdate(
        { channelId: state.channelId },
        {
          channelId: state.channelId,
          matchId: state.matchId,
          state: serialized,
        },
        { upsert: true, new: true },
      );
      log.info(`Active session ${state.matchId} persisted to MongoDB`);
    } catch (error) {
      log.error(`Failed to save active session ${state.matchId}`, error);
      throw error;
    }
  }

  /**
   * Removes an active session from the database.
   */
  async deleteActiveSession(channelId: string): Promise<void> {
    const result = await ActiveSessionModel.deleteOne({ channelId });
    if (result.deletedCount > 0) {
      log.info(`Active session for channel ${channelId} removed from MongoDB`);
    }
  }

  /**
   * Lists all active game sessions, reconstructing Maps properly.
   */
  async listActiveSessions(): Promise<GameState[]> {
    const docs = await ActiveSessionModel.find().lean();
    return docs.map(doc => {
      return JSON.parse(JSON.stringify(doc.state), reviver) as GameState;
    });
  }

  // ── User Preferences ─────────────────────────────────

  /**
   * Gets a user's preferred DM language.
   */
  async getUserLanguage(userId: string): Promise<string | null> {
    const pref = await UserPreferenceModel.findOne({ userId }).lean();
    return pref?.language ?? null;
  }

  /**
   * Saves a user's preferred DM language.
   */
  async setUserLanguage(userId: string, language: string): Promise<void> {
    await UserPreferenceModel.findOneAndUpdate(
      { userId },
      { userId, language },
      { upsert: true },
    );
    log.info(`User ${userId} language preference set to ${language}`);
  }

  /**
   * Checks if MongoDB connection is active (readyState === 1).
   */
  isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}

// ── Serialization helpers ──────────────────────────────

/**
 * JSON replacer to serialize Maps for MongoDB storage.
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
