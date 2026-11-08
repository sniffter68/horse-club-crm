import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export type BookingResponse = { action: 'confirm_booking' | 'cancel_booking'; bookingId: string };

export function parseBookingResponse(payload: unknown): BookingResponse | undefined {
  let value: unknown = payload;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { throw new BadRequestException('Некорректные данные кнопки VK'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (data.action !== 'confirm_booking' && data.action !== 'cancel_booking') return undefined;
  if (typeof data.bookingId !== 'string' || !isUUID(data.bookingId)) {
    throw new BadRequestException('Некорректный номер записи');
  }
  return { action: data.action, bookingId: data.bookingId };
}

export function reminderKeyboard(bookingId: string): string {
  return JSON.stringify({ inline: true, one_time: false, buttons: [[
    { action: { type: 'callback', label: '✅ Подтверждаю', payload: JSON.stringify({ action: 'confirm_booking', bookingId }) }, color: 'positive' },
    { action: { type: 'callback', label: '❌ Не смогу прийти', payload: JSON.stringify({ action: 'cancel_booking', bookingId }) }, color: 'negative' },
  ]] });
}
