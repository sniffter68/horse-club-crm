import type { Request, CookieOptions } from 'express';
import { isTrustedOrigin } from '../common/trusted-origins';
export const sessionCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-horsecrm-session' : 'horsecrm-session';
export const ACCESS_TOKEN_SECONDS = 30 * 24 * 60 * 60;
// Browser persistence limit; renewed on refresh, without a server-side idle timeout.
export const REFRESH_COOKIE_MS = 400 * 24 * 60 * 60_000;
export const refreshCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-horsecrm-refresh' : 'horsecrm-refresh';
export const sessionCookieOptions = (origin?: string): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Only trusted native origins need cross-site cookies; ordinary web sessions stay strict.
  sameSite: process.env.NODE_ENV === 'production' && origin && origin !== 'https://crm.horseclub68.ru' && isTrustedOrigin(origin) ? 'none' : 'strict',
  path: '/', maxAge: ACCESS_TOKEN_SECONDS * 1000,
});
export const refreshCookieOptions = (origin?: string): CookieOptions => ({ ...sessionCookieOptions(origin), maxAge: REFRESH_COOKIE_MS });
export function refreshCookie(req: Request): string | null {
  return readCookie(req, refreshCookieName());
}
export function sessionCookie(req: Request): string | null {
  return readCookie(req, sessionCookieName());
}
function readCookie(req: Request, name: string): string | null {
  const prefix = `${name}=`;
  const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}
