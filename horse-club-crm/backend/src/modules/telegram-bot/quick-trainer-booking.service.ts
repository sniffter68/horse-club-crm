import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../../auth/auth.types';
import { RoleAccessService } from '../../auth/role-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../../clients/clients.service';
import { QuickCreateClientDto } from '../../clients/dto/quick-create-client.dto';
import { CreateLessonDto } from '../../lessons/dto/create-lesson.dto';
import { LessonsService } from '../../lessons/lessons.service';

export class QuickTrainerClientQuery {
  @IsOptional() @IsString() @MaxLength(150)
  search?: string;
}

@Injectable()
export class QuickTrainerBookingService {
  constructor(private readonly prisma: PrismaService, private readonly clients: ClientsService, private readonly lessons: LessonsService) {}

  async permissions(actor: AuthUser) {
    const policy = await new RoleAccessService(this.prisma).permissions(actor.role);
    return { lessonCreateOwn: policy.lessonCreateOwn, lessonCreateAny: policy.lessonCreateAny };
  }

  async authorize(actor: AuthUser) {
    const policy = await this.permissions(actor);
    if (!policy.lessonCreateAny && !(policy.lessonCreateOwn && actor.trainerId))
      throw new ForbiddenException('Создание записей запрещено настройками роли');
    return policy;
  }

  async context(actor: AuthUser, date: string) {
    const permissions = await this.authorize(actor);
    const day = DateTime.fromISO(date, { zone: 'Europe/Moscow' });
    if (!day.isValid || day.toISODate() !== date) throw new BadRequestException('Некорректная дата');
    const start = day.startOf('day').toJSDate(), end = day.plus({ days: 1 }).startOf('day').toJSDate();
    const [services, trainers, horses, arenas, schedule, lessons, bookings] = await Promise.all([
      this.prisma.service.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, name: true, title: true, durationMinutes: true, allowMembership: true } }),
      this.prisma.trainer.findMany({ where: { isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, fullName: true } }),
      this.prisma.horse.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, status: true, healthStatus: true, isUnavailable: true, maxDailyMinutes: true, maxDailyWorkloadMinutes: true } }),
      this.prisma.arena.findMany({ where: { isActive: true, isUnavailable: false }, orderBy: { id: 'asc' }, select: { id: true, name: true } }),
      this.prisma.clubSchedule.findUnique({ where: { id: 1 } }),
      this.prisma.lesson.findMany({ where: { deletedAt: null, status: { not: 'CANCELLED' }, startTime: { lt: end }, endTime: { gt: start } },
        select: { startTime: true, endTime: true, trainerId: true, arenaId: true, bookings: { select: { horseId: true } } } }),
      this.prisma.booking.findMany({ where: { lessonId: null, status: { in: ['scheduled', 'completed', 'no_show'] }, startTime: { lt: end }, endTime: { gt: start } },
        select: { startTime: true, endTime: true, trainerId: true, arenaId: true, horseId: true } }),
    ]);
    const entries = [...lessons.map(row => ({ startTime: row.startTime, endTime: row.endTime, trainerId: row.trainerId, arenaId: row.arenaId,
      horseIds: row.bookings.flatMap(b => b.horseId ? [b.horseId] : []) })),
    ...bookings.map(row => ({ ...row, horseIds: row.horseId ? [row.horseId] : [] }))];
    return { permissions, services, trainers, arenas, openTime: schedule?.openTime ?? '09:00', closeTime: schedule?.closeTime ?? '21:00', daysOfWeekOff: schedule?.daysOfWeekOff ?? [], entries,
      horses: horses.map(horse => ({ ...horse, maxDailyMinutes: Math.min(horse.maxDailyMinutes, horse.maxDailyWorkloadMinutes), usedMinutes: entries.filter(row => row.horseIds.includes(horse.id)).reduce((sum, row) => sum + Math.ceil((+row.endTime - +row.startTime) / 60000), 0) })) };
  }

  async search(actor: AuthUser, search = '') {
    await this.authorize(actor);
    const query = search.trim();
    return this.prisma.client.findMany({ where: { deletedAt: null, ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { phone: { contains: query } }] } : {}) },
      take: 30, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, phone: true } });
  }

  async quickClient(actor: AuthUser, dto: QuickCreateClientDto) {
    await this.authorize(actor);
    const client = await this.clients.quickCreate({ name: dto.name, phone: dto.phone });
    return { id: client.id, name: client.name, phone: client.phone };
  }

  async create(actor: AuthUser, dto: CreateLessonDto) {
    const policy = await this.authorize(actor);
    if (!policy.lessonCreateAny && dto.trainerId && dto.trainerId !== actor.trainerId)
      throw new ForbiddenException('Тренер может создавать записи только в своё расписание');
    if (!dto.clientId) throw new BadRequestException('Выберите клиента');
    // Only booking fields cross this boundary; status and finances belong to LessonsService.
    const lesson = await this.lessons.createLesson({ trainerId: dto.trainerId, clientId: dto.clientId, horseId: dto.horseId,
      serviceId: dto.serviceId, arenaId: dto.arenaId, startTime: dto.startTime, durationMinutes: dto.durationMinutes }, undefined, actor);
    return { id: lesson.id, startTime: lesson.startTime };
  }
}
