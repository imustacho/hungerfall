import mongoose, { Schema, Document } from 'mongoose';

/**
 * Mongoose schema for completed match records.
 */
export interface IMatch extends Document {
  matchId: string;
  guildId: string;
  channelId: string;
  winnerId: string | null;
  winnerName: string | null;
  playerCount: number;
  roundCount: number;
  seed: number;
  startedAt: number;
  endedAt: number;
  fullState: any;
}

const MatchSchema = new Schema<IMatch>(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    winnerId: { type: String, default: null },
    winnerName: { type: String, default: null },
    playerCount: { type: Number, required: true },
    roundCount: { type: Number, required: true },
    seed: { type: Number, required: true },
    startedAt: { type: Number, required: true },
    endedAt: { type: Number, required: true },
    fullState: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const MatchModel = mongoose.model<IMatch>('Match', MatchSchema);
