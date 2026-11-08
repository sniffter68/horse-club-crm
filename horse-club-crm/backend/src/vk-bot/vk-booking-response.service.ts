import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { queueVkAdministratorNotification } from './vk-delivery.module';
import type { BookingResponse } from './vk-booking-response';

export const bookingResponseText = {
  confirmed: 'Спасибо, зафиксировали! Ждём вас на занятии в назначенное время 🐴',
  cancellationRequested: 'Передали администратору ваш запрос на отмену записи. Он подтвердит отмену и согласует условия. Записаться снова можно на horseclub68.ru или по телефону +7 (915) 672-00-30.',
  stale: 'Эта запись уже завершена или была отменена.',
  unavailable: 'Запись не найдена или недоступна для вашего профиля VK.',
} as const;

@Injectable()
export class VkBookingResponseService {
  constructor(private readonly prisma: PrismaService) {}

  async respond(sender: number, payload: BookingResponse): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const booking = await tx.booking.findUnique({ where: { id: payload.bookingId }, include: { client: true, lesson: true } });
          // Do not disclose other clients' bookings, even their status.
          if (!booking || booking.client.vkUserId !== BigInt(sender)) return bookingResponseText.unavailable;
          const now = new Date();
          const start = booking.lesson?.startTime ?? booking.startTime;
          if (start <= now || booking.status !== 'scheduled' || booking.attendanceStatus !== 'PENDING'
            || (booking.lesson && (booking.lesson.status !== 'SCHEDULED' || booking.lesson.deletedAt))) return bookingResponseText.stale;
          if (booking.clientCancellationRequested) return bookingResponseText.cancellationRequested;
          const cancel = payload.action === 'cancel_booking';
          if (!cancel && booking.clientConfirmed) return bookingResponseText.confirmed;
          const changed = await tx.booking.updateMany({
            where: { id: booking.id, updatedAt: booking.updatedAt, status: 'scheduled', attendanceStatus: 'PENDING',
              clientCancellationRequested: false, client: { vkUserId: BigInt(sender) },
              OR: [{ lessonId: null, startTime: { gt: now } },
                { lesson: { is: { status: 'SCHEDULED', deletedAt: null, startTime: { gt: now } } } }] },
            data: cancel ? { clientCancellationRequested: true, clientConfirmed: false } : { clientConfirmed: true },
          });
          if (!changed.count) return bookingResponseText.stale;
          if (cancel) {
            // An administrator applies the existing cancellation/refund policy.
            // Never bypass membership charges or cancel all riders in a group lesson.
            const recipients = await queueVkAdministratorNotification(tx, `booking-cancel-request:${booking.id}:${start.toISOString()}`,
              `⚠️ Клиент ${booking.client.name} запросил отмену записи #${booking.id} на ${DateTime.fromJSDate(start, { zone: 'Europe/Moscow' }).toFormat('dd.MM.yyyy HH:mm')} через бота! Подтвердите отмену в CRM, чтобы освободить слот.`);
            if (!recipients) throw new ServiceUnavailableException('Не удалось передать запрос: администратор VK не настроен. Позвоните +7 (915) 672-00-30.');
          }
          return cancel ? bookingResponseText.cancellationRequested : bookingResponseText.confirmed;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: unknown) {
        if (isSerializationFailure(error) && attempt < 2) continue;
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException('Не удалось сохранить ответ. Повторите нажатие позже или позвоните +7 (915) 672-00-30.');
      }
    }
    throw new ServiceUnavailableException('Повторите нажатие позже.');
  }
}
