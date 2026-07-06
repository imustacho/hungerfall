import OpenAI from 'openai';
import { Narrator } from './Narrator.js';
import { FallbackNarrator } from './FallbackNarrator.js';
import { NarrationContext } from '../types/game.js';
import { NARRATOR_SYSTEM_PROMPT, buildNarrationPrompt } from './prompts.js';
import { getLocale } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AINarrator');

/**
 * AI-powered narrator using any OpenAI-compatible API.
 *
 * Works with:
 * - OpenAI (https://api.openai.com/v1)
 * - Ollama (http://localhost:11434/v1)
 * - LM Studio (http://localhost:1234/v1)
 * - Groq (https://api.groq.com/openai/v1)
 * - Together AI (https://api.together.xyz/v1)
 * - Google Gemini (https://generativelanguage.googleapis.com/v1beta/openai)
 * - Any other OpenAI-compatible endpoint
 *
 * Falls back to FallbackNarrator on any failure.
 */
export class AINarrator implements Narrator {
  private client: OpenAI;
  private model: string;
  private fallback: FallbackNarrator;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
    this.model = model;
    this.fallback = new FallbackNarrator();
    log.info(`AI Narrator initialized — model: ${model}, endpoint: ${baseUrl}`);
  }

  async narrate(context: NarrationContext): Promise<string> {
    try {
      // Build event descriptions for the AI
      const eventDescriptions = this.buildEventDescriptions(context);
      const aliveNames = context.alivePlayers.map(p => p.username);
      const deadThisRound = context.result.deaths.map(id => {
        const player = context.allPlayers.find(p => p.id === id);
        return player?.username || 'Unknown';
      });

      const userPrompt = buildNarrationPrompt({
        roundNumber: context.roundNumber,
        events: eventDescriptions,
        alivePlayers: aliveNames,
        deadPlayers: deadThisRound,
        recentHistory: context.history.slice(-3),
        aliveCount: context.alivePlayers.length,
        totalPlayers: context.allPlayers.length,
      });

      const strings = getLocale(context.language);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: NARRATOR_SYSTEM_PROMPT + '\n' + strings.narratorLanguageInstruction },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.9,
      });

      const text = response.choices[0]?.message?.content?.trim();

      if (!text || text.length < 10) {
        log.warn('AI returned empty/too-short narration, using fallback');
        return this.fallback.narrate(context);
      }

      log.debug(`AI narration generated (${text.length} chars)`);
      return text;
    } catch (error) {
      log.error('AI narration failed, using fallback', error);
      return this.fallback.narrate(context);
    }
  }

  /**
   * Converts structured game events into human-readable descriptions for the AI.
   */
  private buildEventDescriptions(context: NarrationContext): string[] {
    const descriptions: string[] = [];
    const players = context.allPlayers;
    const getName = (id: string) => players.find(p => p.id === id)?.username || 'Unknown';

    for (const event of context.result.events) {
      switch (event.type) {
        case 'damage':
          descriptions.push(
            `${getName(event.attackerId)} attacked ${getName(event.targetId)} for ${event.amount} damage` +
            (event.wasDefending ? ' (target was defending)' : '')
          );
          break;
        case 'death':
          descriptions.push(
            event.killerId
              ? `${getName(event.playerId)} was killed by ${getName(event.killerId)}`
              : `${getName(event.playerId)} died from ${event.cause}`
          );
          break;
        case 'heal':
          descriptions.push(`${getName(event.playerId)} healed for ${event.actualAmount} HP`);
          break;
        case 'defend':
          descriptions.push(`${getName(event.playerId)} took a defensive stance`);
          break;
        case 'hide':
          descriptions.push(`${getName(event.playerId)} hid`);
          break;
        case 'move':
          descriptions.push(`${getName(event.playerId)} repositioned`);
          break;
        case 'item_found':
          descriptions.push(`${getName(event.playerId)} found a ${event.itemName}`);
          break;
        case 'evasion':
          descriptions.push(
            `${getName(event.targetId)} evaded ${getName(event.attackerId)}'s attack (was ${event.reason})`
          );
          break;
        case 'help':
          descriptions.push(`${getName(event.playerId)} helped teammate ${getName(event.targetId)}`);
          break;
        case 'betray':
          descriptions.push(
            `${getName(event.playerId)} betrayed teammate ${getName(event.targetId)} for ${event.damage} damage`
          );
          break;
        case 'status_damage':
          descriptions.push(
            `${getName(event.playerId)} took ${event.amount} damage from ${event.statusType}`
          );
          break;
        case 'status_applied':
          descriptions.push(
            `${getName(event.playerId)} gained ${event.statusType} status`
          );
          break;
        case 'status_expired':
          descriptions.push(
            `${getName(event.playerId)}'s ${event.statusType} wore off`
          );
          break;
      }
    }

    return descriptions;
  }
}
