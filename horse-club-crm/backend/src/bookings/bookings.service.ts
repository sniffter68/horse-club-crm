import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingServiceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { BookingRulesService } from './booking-rules.service';
import { BookingValidationError } from './booking-validation.error';
import type { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService, private readonly rules: BookingRulesService) {}

  async createBooking(dto: CreateBookingDto) {
    const start = new Date(dto.startTime), end = new Date(dto.endTime);
    const zoned = /T.*(?:Z|[+-]\d{2}:\d{2})$/i;
    if (!zoned.test(dto.startTime) || !zoned.test(dto.endTime) || !Number.isFinite(+start) || !Number.isFinite(+end) || start >= end) {
      throw new BadRequestException('Укажите корректный интервал с часовым поясом');
    }
    if (!Object.values(BookingServiceType).includes(dto.serviceType) || !Number.isFinite(dto.costAmount) || dto.costAmount < 0 || dto.costAmount > 999999999999.99 || new Prisma.Decimal(dto.costAmount).decimalPlaces() > 2) {
      throw new BadRequestException('Некорректный тип услуги или стоимость');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          await this.rules.validate(tx, { trainerId: dto.trainerId, arenaId: dto.arenaId, participants: [{ clientId: dto.clientId, horseId: dto.horseId }], start, end });
          if (dto.membershipId) {
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Membership" WHERE "id" = ${dto.membershipId}::uuid FOR UPDATE`);
            const membership = await tx.membership.findUnique({ where: { id: dto.membershipId } });
            if (!membership || membership.clientId !== dto.clientId) throw new BookingValidationError('MEMBERSHIP_INVALID', 'Абонемент не принадлежит клиенту');
          }
          return tx.booking.create({ data: {
            clientId: dto.clientId, trainerId: dto.trainerId, horseId: dto.horseId, arenaId: dto.arenaId,
            membershipId: dto.membershipId ?? null, startTime: start, endTime: end,
            serviceType: dto.serviceType, costAmount: new Prisma.Decimal(dto.costAmount), status: 'scheduled',
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
      } catch (error: unknown) {
        if (!isSerializationFailure(error)) throw error;
        if (attempt === 4) throw new BookingValidationError('BOOKING_CONTENTION', 'Ресурсы изменились одновременно. Повторите бронирование');
      }
    }
    throw new BookingValidationError('BOOKING_CONTENTION', 'Повторите бронирование');
  }
}
