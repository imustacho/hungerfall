import mongoose, { Schema, Document } from 'mongoose';

/**
 * Mongoose schema for user preferences.
 * Stores each user's preferred DM language so they are not asked again.
 */
export interface IUserPreference extends Document {
  userId: string;
  language: string;
}

const UserPreferenceSchema = new Schema<IUserPreference>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    language: { type: String, required: true, default: 'en' },
  },
  { timestamps: true },
);

export const UserPreferenceModel = mongoose.model<IUserPreference>('UserPreference', UserPreferenceSchema);
