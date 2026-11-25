import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATA_DIR: z.string().default('./data'),
  APP_SECRET: z.string().min(24, 'APP_SECRET must be at least 24 characters'),
  KITE_API_KEY: z.string().default(''),
  KITE_API_SECRET: z.string().default(''),
  /** built frontend to serve from / (blank = ../frontend/dist when it exists) */
  FRONTEND_DIR: z.string().default(''),
});

export type Config = Omit<z.infer<typeof schema>, 'DATA_DIR'> & { DATA_DIR: string };

/** Minimal .env reader (KEY=VALUE per line, # comments, optional quotes). Real environment variables win. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, envFile = resolve(process.cwd(), '.env')): Config {
  const fromFile = existsSync(envFile) ? parseDotEnv(readFileSync(envFile, 'utf8')) : {};
  const merged = { ...fromFile, ...env };
  const parsed = schema.safeParse(merged);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return { ...parsed.data, DATA_DIR: resolve(parsed.data.DATA_DIR) };
}
