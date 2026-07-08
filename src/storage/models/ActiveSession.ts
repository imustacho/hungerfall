import mongoose, { Schema, Document } from 'mongoose';

/**
 * Mongoose schema for active game sessions.
 * Stores a serialized snapshot of the GameState so games can be resumed after a restart.
 */
export interface IActiveSession extends Document {
  channelId: string;
  matchId: string;
  /** Serialized GameState (Maps stored as { __type: 'Map', entries: [...] }) */
  state: any;
}

const ActiveSessionSchema = new Schema<IActiveSession>(
  {
    channelId: { type: String, required: true, unique: true, index: true },
    matchId: { type: String, required: true },
    state: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const ActiveSessionModel = mongoose.model<IActiveSession>('ActiveSession', ActiveSessionSchema);
