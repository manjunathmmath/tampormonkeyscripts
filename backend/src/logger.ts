import pino, { type Logger } from 'pino';
import type { Writable } from 'node:stream';

export type { Logger };

/**
 * Structured logger. Secrets must never be logged: these paths are redacted wherever they appear in a log object.
 * With `extra` (the System screen's activity log) every line also goes to that stream, after redaction.
 */
export function createLogger(level: string, extra?: Writable): Logger {
  const opts = {
    level,
    redact: {
      paths: ['*.accessToken', '*.access_token', '*.apiSecret', '*.api_secret', '*.appSecret', 'req.headers.authorization', 'headers.authorization', '*.request_token'],
      censor: '[redacted]',
    },
  };
  if (!extra || level === 'silent') return pino(opts);
  return pino(opts, pino.multistream([{ stream: process.stdout }, { stream: extra }]));
}
