import { telegram, telegramRequiredError } from './telegram';

const ZONE = 'Europe/Moscow';

export interface Service { id: string; title: string; name: string; description: string | null; price: string; durationMinutes: number }
export interface Slot { startTime: string; endTime: string; trainers: { id: string; name: string }[] }
export interface Membership {
  id: string; title: string; totalLessons: number; remainingLessons?: number; remainedLessons?: number;
  status?: string; planName?: string;
  validUntil: string; isExpiringSoon: boolean;
}
export interface MyBookingsResponse { bookings: Booking[]; hasMore: boolean; membership: Membership | null }
export interface ClientOverview { client: { id: string; name: string; firstName: string; lastName: string; phone: string | null }; membership: Membership | null; bookings: Booking[] }
let sessionToken: string | null = null;
export function setClientSession(token: string | null): void { sessionToken = token; }
export interface ClientDashboard { client?: ClientOverview['client']; bookings?: Booking[]; isEstablished: boolean; membership: Membership | null; nextBooking: Booking | null }
export type BootstrapResponse = { role: 'CLIENT'; token: string | null; clientId: string | null; clientName: string | null;
  activeMembership: Membership | null; nextLesson: Booking | null } | { role: 'UNLINKED_CLIENT'; needsPhoneLink: true; vkUserId?: string } | { role: 'ADMIN' | 'TRAINER' | 'STAFF' };
export interface Booking {
  id: string; canCancel?: boolean; canConfirm?: boolean; canReschedule?: boolean; horse?: { name: string } | null; startTime: string; endTime: string; status: string; clientConfirmed: boolean;
  clientCancellationRequested: boolean; costAmount: string; trainer?: { name?: string } | null;
  lesson?: { status: string; deletedAt: string | null; startTime: string; endTime: string; service?: { title?: string; name?: string } | null } | null;
}
export const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function requireUuid(value: string): string {
  if (!isUuid(value)) throw new Error('Обновите данные записи');
  return value;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options, true);
}
let renewal: Promise<BootstrapResponse> | undefined;
async function request<T>(path: string, options: RequestInit, retry: boolean): Promise<T> {
  const initData = telegram()?.initData;
  if (!initData && !sessionToken) throw telegramRequiredError();
  const response = await fetch(`/api/tma/${path}`, { ...options, credentials: 'omit', cache: 'no-store',
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: sessionToken && path !== 'bootstrap' ? `Bearer ${sessionToken}` : `tma ${initData}`, ...(initData ? { 'X-Telegram-Init-Data': initData } : {}) } });
  if (response.status === 401 && initData && path !== 'bootstrap' && retry) {
    renewal ??= request<BootstrapResponse>('bootstrap', { method: 'POST', body: JSON.stringify({ initData }) }, false)
      .finally(() => { renewal = undefined; });
    const result = await renewal;
    setClientSession(result.role === 'CLIENT' ? result.token : null);
    if (result.role === 'UNLINKED_CLIENT') {
      window.dispatchEvent(new Event('tma:phone-link-required'));
      throw new Error('Подтвердите телефон для привязки кабинета');
    }
    if (result.role !== 'CLIENT') throw new Error('Откройте кабинет персонала: /tma/trainer');
    return request<T>(path, options, false);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
    throw new Error(`${typeof message === 'string' ? message : 'Проверьте соединение и повторите запрос'} (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const money = (value: string): string => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value));
export const dateTime = (value?: string, dateOnly = false): string => {
  const date = value ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: ZONE, dateStyle: dateOnly ? 'short' : 'long', timeStyle: dateOnly ? undefined : 'short' }).format(date)
    : 'Дату и время уточнит администратор';
};
export const time = (value: string): string => new Intl.DateTimeFormat('ru-RU', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const moscowDate = (offset = 0): string => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(`${today}T12:00:00+03:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
export const upcoming = (booking: Booking): boolean => booking.status === 'scheduled'
  && (!booking.lesson || (!booking.lesson.deletedAt && booking.lesson.status === 'SCHEDULED'))
  && new Date(booking.lesson?.startTime ?? booking.startTime).getTime() > Date.now();
