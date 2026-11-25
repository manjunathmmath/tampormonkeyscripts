import { createHash, timingSafeEqual } from 'node:crypto';

/** True when the request's "Authorization: Bearer <secret>" header matches the app secret (constant-time compare of hashes). */
export function isAuthorized(header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !m[1]) return false;
  const a = createHash('sha256').update(m[1]).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
