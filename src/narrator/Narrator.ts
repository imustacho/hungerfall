import { NarrationContext } from '../types/game.js';

/**
 * Interface for all narrator implementations.
 * The narrator receives structured game events and produces cinematic text.
 * It must NEVER alter gameplay — it only describes what already happened.
 */
export interface Narrator {
  /**
   * Generates a narration for a round's events.
   * @param context - All information about the round
   * @returns The narration text
   */
  narrate(context: NarrationContext): Promise<string>;
}
