import { defineConfig } from 'vitest/config';

// TZ matches the userscript's browser (IST): the oracle's moment() and Date() calls read the local zone.
export default defineConfig({ test: { env: { TZ: 'Asia/Kolkata' }, include: ['tests/**/*.test.ts'] } });
