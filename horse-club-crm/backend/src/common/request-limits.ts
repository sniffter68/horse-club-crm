import type { Request, Response, NextFunction } from 'express';
import { sessionCookie } from '../auth/session-cookie';

// Single-process limiter for the single backend in docker-compose.prod.yml.
// Fail closed on capacity rather than evicting active limits.
export function requestLimits() {
  const buckets = new Map<string, { count: number; until: number }>();
  let sweepAt = 0;
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if ((origin && origin !== `${req.protocol}://${req.get('host')}`) || (sessionCookie(req) && !origin)) {
        res.status(403).json({ statusCode: 403, message: 'Недопустимый источник запроса' });
        return;
      }
    }
    const now = Date.now();
    if (now >= sweepAt) {
      for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
      sweepAt = now + 60_000;
    }
    const path = req.path.replace(/\/+$/, '').toLowerCase();
    const login = path === '/api/auth/login';
    const lead = path === '/api/leads' && req.method === 'POST';
    const limit = login ? 10 : lead ? 5 : 300;
    const duration = login || lead ? 15 * 60_000 : 60_000;
    const key = `${login ? 'login' : lead ? 'lead' : 'api'}:${req.ip ?? req.socket.remoteAddress}`;
    const bucket = buckets.get(key);
    if ((!bucket && buckets.size >= 10_000) || (bucket && bucket.until > now && bucket.count >= limit)) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(((bucket?.until ?? now + duration) - now) / 1000))));
      res.status(429).json({ statusCode: 429, message: 'Слишком много запросов. Повторите позже.' });
      return;
    }
    if (!bucket || bucket.until <= now) buckets.set(key, { count: 1, until: now + duration });
    else bucket.count++;
    next();
  };
}
