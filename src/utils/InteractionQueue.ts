import { createLogger } from './logger.js';

const log = createLogger('InteractionQueue');

/**
 * Serializes asynchronous tasks sequentially per channel/session ID.
 * This guarantees that state mutations (lobby actions, DM choices, item usage)
 * are processed in the order they are received and do not execute concurrently.
 */
class InteractionQueue {
  private queues: Map<string, Promise<any>> = new Map();

  /**
   * Enqueues an async task for a given channel/session.
   * Chained tasks execute sequentially. Preceding errors are caught and logged,
   * so a failed interaction does not block subsequent operations.
   */
  async enqueue<T>(channelId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(channelId) || Promise.resolve();

    const current = (async () => {
      try {
        await previous;
      } catch (err) {
        log.error(`Queue error in preceding task for channel ${channelId}`, err);
      }
      return await task();
    })();

    this.queues.set(channelId, current);

    // Cleanup queue map after task finishes to release memory
    current.finally(() => {
      if (this.queues.get(channelId) === current) {
        this.queues.delete(channelId);
      }
    });

    return current;
  }
}

export const interactionQueue = new InteractionQueue();
