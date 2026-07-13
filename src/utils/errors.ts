/**
 * Base error class for all Hungerfall errors.
 */
export class HungerfallError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'HungerfallError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Errors related to game logic and engine operations.
 */
export class GameError extends HungerfallError {
  constructor(message: string, code: string = 'GAME_ERROR') {
    super(message, code);
    this.name = 'GameError';
  }
}

/**
 * Errors related to lobby operations.
 */
export class LobbyError extends HungerfallError {
  constructor(message: string, code: string = 'LOBBY_ERROR') {
    super(message, code);
    this.name = 'LobbyError';
  }
}

/**
 * Errors related to AI narration.
 */
export class NarratorError extends HungerfallError {
  constructor(message: string, code: string = 'NARRATOR_ERROR') {
    super(message, code);
    this.name = 'NarratorError';
  }
}

/**
 * Errors related to data storage.
 */
export class StorageError extends HungerfallError {
  constructor(message: string, code: string = 'STORAGE_ERROR') {
    super(message, code);
    this.name = 'StorageError';
  }
}

/**
 * Errors related to Discord interactions (timeouts, permission issues, etc.).
 */
export class InteractionError extends HungerfallError {
  constructor(message: string, code: string = 'INTERACTION_ERROR') {
    super(message, code);
    this.name = 'InteractionError';
  }
}

/**
 * Checks if an error is a database/mongoose error.
 */
export function isDatabaseError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'MongooseError' ||
      error.name === 'MongoError' ||
      error.name === 'MongoServerError' ||
      error.name === 'MongoNetworkError' ||
      error.message.includes('buffering timed out') ||
      error.message.includes('MongoServerSelectionError') ||
      error.message.includes('connection')
    );
  }
  return false;
}
