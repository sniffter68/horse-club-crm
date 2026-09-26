import type { Request, CookieOptions } from 'express';
export const sessionCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-horsecrm-session' : 'horsecrm-session';
export const sessionCookieOptions = (): CookieOptions => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 30 * 60_000 });
export function sessionCookie(req: Request): string | null {
  const prefix = `${sessionCookieName()}=`;
  const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}
