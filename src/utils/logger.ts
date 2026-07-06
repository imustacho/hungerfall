import winston from 'winston';
import { getConfig } from '../config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, context, ...meta }) => {
  const ctx = context ? `[${context}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `${timestamp} ${level} ${ctx} ${message}${metaStr}${stackStr}`;
});

let _logger: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (!_logger) {
    let logLevel: string;
    try {
      logLevel = getConfig().logLevel;
    } catch {
      logLevel = 'info';
    }

    _logger = winston.createLogger({
      level: logLevel,
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat,
      ),
      transports: [
        new winston.transports.Console({
          format: combine(colorize(), logFormat),
        }),
      ],
    });
  }
  return _logger;
}

/**
 * Creates a child logger with a fixed context label.
 * Usage: `const log = createLogger('GameEngine');`
 */
export function createLogger(context: string): winston.Logger {
  return getLogger().child({ context });
}
