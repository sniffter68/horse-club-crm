import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import type { CompleteVetEventDto, CreateVetEventDto, VetQueryDto } from './boarding.dto';
import { period, serializable } from './boarding.service';

const include = { horse: { select: { id: true, name: true, status: true } } } satisfies Prisma.VetEventInclude;
export const vetStatus = (event: { status: string; eventDate: Date }, now: Date) => event.status === 'completed' ? 'completed'
  : DateTime.fromJSDate(event.eventDate, { zone: process.env.CLUB_TIME_ZONE || 'Europe/Moscow' }).startOf('day')
    < DateTime.fromJSDate(now, { zone: process.env.CLUB_TIME_ZONE || 'Europe/Moscow' }).startOf('day') ? 'overdue' : 'scheduled';

@Injectable()
export class VetCalendarService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: VetQueryDto, upcoming = false) {
    const now = new Date();
    const horizon = DateTime.fromJSDate(now, { zone: process.env.CLUB_TIME_ZONE || 'Europe/Moscow' }).plus({ days: 14 }).endOf('day').toJSDate();
    const where: Prisma.VetEventWhereInput = { horseId: query.horseId, type: query.type,
      ...(upcoming ? { status: { not: 'completed' }, eventDate: { lte: horizon } } : { eventDate: period(query) }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vetEvent.findMany({ where, include, orderBy: [{ eventDate: upcoming ? 'asc' : 'desc' }, { id: 'asc' }], skip: query.offset, take: query.limit }),
      this.prisma.vetEvent.count({ where }),
    ]);
    return { data: data.map(event => ({ ...event, status: vetStatus(event, now) })), total };
  }
  async create(dto: CreateVetEventDto) {
    const eventDate = new Date(dto.eventDate);
    this.validateNext(dto.nextDueDate, eventDate);
    if (dto.status === 'completed' && eventDate > new Date()) throw new BadRequestException('Выполненная процедура не может быть в будущем');
    return serializable(this.prisma, async tx => {
      await this.lockHorse(tx, dto.horseId);
      const event = await tx.vetEvent.create({ data: { ...dto, status: dto.status ?? 'scheduled', eventDate, nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
        notes: dto.notes?.trim() || null, performedBy: dto.performedBy?.trim() || null }, include });
      if (event.status === 'completed') await this.followup(tx, event);
      return { ...event, status: vetStatus(event, new Date()) };
    });
  }
  async complete(id: string, dto: CompleteVetEventDto) {
    return serializable(this.prisma, async tx => {
      const initial = await tx.vetEvent.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Процедура не найдена');
      await this.lockHorse(tx, initial.horseId);
      await tx.$queryRaw`SELECT "id" FROM "VetEvent" WHERE "id"=${id}::uuid FOR UPDATE`;
      const current = await tx.vetEvent.findUniqueOrThrow({ where: { id }, include });
      if (current.status === 'completed') return current;
      const eventDate = new Date();
      const nextDueDate = dto.nextDueDate ?? current.nextDueDate?.toISOString();
      this.validateNext(nextDueDate, eventDate);
      const event = await tx.vetEvent.update({ where: { id }, data: { status: 'completed', eventDate,
        nextDueDate: nextDueDate ? new Date(nextDueDate) : null, performedBy: dto.performedBy?.trim() || current.performedBy,
        notes: dto.notes?.trim() || current.notes }, include });
      await this.followup(tx, event);
      return event;
    });
  }
  private validateNext(next: string | undefined, date: Date) {
    if (next && new Date(next) <= date) throw new BadRequestException('Следующая процедура должна быть позже выполненной');
  }
  private async lockHorse(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id"=${id}::uuid FOR UPDATE`;
    if (!await tx.horse.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Лошадь не найдена');
  }
  private async followup(tx: Prisma.TransactionClient, event: { id: string; horseId: string; type: Prisma.VetEventCreateInput['type']; nextDueDate: Date | null }) {
    if (event.nextDueDate) await tx.vetEvent.upsert({ where: { predecessorId: event.id }, update: {}, create: {
      horseId: event.horseId, type: event.type, eventDate: event.nextDueDate, predecessorId: event.id, status: 'scheduled',
    } });
  }
}
