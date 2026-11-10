import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../auth/auth.types';
import { BookingsService } from '../../bookings/bookings.service';
import { LessonsService } from '../../lessons/lessons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../../settings/module-access.service';
import { validateTelegramInitData } from './telegram-init-data';
import type { TrainerTmaHorseDto, TrainerTmaStatusDto } from './trainer-tma.dto';

export const TRAINER_TMA_AUDIENCE = 'trainer-tma';
export interface TrainerTmaActor extends AuthUser { telegramUserId: string; trainerId: string }

@Injectable()
export class TrainerTmaService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService,
    private readonly access: ModuleAccessService, private readonly lessons: LessonsService,
    private readonly bookings: BookingsService) {}

  private async linkedUser(telegramUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { telegramUserId }, include: { trainer: true, staffProfile: true } });
    if (!user) return null;
    if (!user.crmAccess || !user.trainerId || !user.trainer?.isActive || user.staffProfile?.isActive === false)
      throw new ForbiddenException('Доступ тренера отключён или карточка тренера не привязана');
    return user;
  }

  async authenticate(initData: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new ServiceUnavailableException('Telegram Mini App временно недоступен');
    const identity = validateTelegramInitData(initData, token);
    const user = await this.linkedUser(identity.telegramUserId);
    if (!user) return { authenticated: false as const, reason: 'NOT_LINKED' as const };
    const permission = (await this.access.forRole(user.role)).find(row => row.module === 'SCHEDULE');
    if (!permission?.isEnabled || permission.accessLevel === 'HIDDEN') throw new ForbiddenException('Расписание недоступно для вашей роли');
    return { authenticated: true as const,
      access_token: await this.jwt.signAsync({ sub: user.id, tokenType: 'trainer-tma',
        telegramUserId: identity.telegramUserId, authVersion: String(user.tokenVersion) },
      { audience: TRAINER_TMA_AUDIENCE, expiresIn: '1h' }),
      trainer: { trainerId: user.trainerId!, name: user.trainer!.name || user.trainer!.fullName },
      accessLevel: permission.accessLevel };
  }

  async session(token: string): Promise<TrainerTmaActor> {
    let payload: unknown;
    try { payload = await this.jwt.verifyAsync<object>(token, { audience: TRAINER_TMA_AUDIENCE, algorithms: ['HS256'] }); }
    catch { throw new UnauthorizedException('Сессия истекла. Откройте приложение заново'); }
    if (!payload || typeof payload !== 'object' || !('tokenType' in payload) || payload.tokenType !== 'trainer-tma'
      || !('telegramUserId' in payload) || typeof payload.telegramUserId !== 'string'
      || !('sub' in payload) || !('authVersion' in payload)) throw new UnauthorizedException('Недействительная сессия');
    const user = await this.linkedUser(payload.telegramUserId);
    if (!user || user.id !== payload.sub || String(user.tokenVersion) !== payload.authVersion)
      throw new UnauthorizedException('Сессия отозвана');
    return { id: user.id, email: user.email, role: user.role, trainerId: user.trainerId!, telegramUserId: payload.telegramUserId };
  }

  async schedule(actor: TrainerTmaActor, date: string) {
    const day = DateTime.fromISO(date, { zone: 'Europe/Moscow' });
    if (!day.isValid || day.toISODate() !== date) throw new BadRequestException('Некорректная дата');
    const lessons = await this.prisma.lesson.findMany({ where: { trainerId: actor.trainerId,
      // Retain cancelled rows in the trainer's day, including soft-deleted cancellations.
      OR: [{ deletedAt: null }, { status: 'CANCELLED' }],
      startTime: { gte: day.startOf('day').toJSDate(), lt: day.plus({ days: 1 }).startOf('day').toJSDate() } },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
      select: { id: true, startTime: true, endTime: true, status: true, service: { select: { title: true, name: true } },
        bookings: { orderBy: { id: 'asc' }, select: { id: true, cancellationReason: true,
          client: { select: { name: true, firstName: true, lastName: true } }, horse: { select: { id: true, name: true } } } } } });
    return lessons.map(lesson => ({ id: lesson.id, startTime: lesson.startTime, endTime: lesson.endTime, status: lesson.status,
      serviceName: lesson.service.title || lesson.service.name,
      clientName: lesson.bookings.map(b => b.client.name || `${b.client.firstName} ${b.client.lastName}`).join(', '),
      horseId: lesson.bookings.length === 1 ? lesson.bookings[0].horse?.id ?? null : null,
      horseName: lesson.bookings.map(b => b.horse?.name).filter(Boolean).join(', ') || null,
      notes: lesson.bookings.map(b => b.cancellationReason).filter(Boolean).join('; ') || null,
      participants: lesson.bookings.map(b => ({ bookingId: b.id, clientName: b.client.name || `${b.client.firstName} ${b.client.lastName}`,
        horseId: b.horse?.id ?? null, horseName: b.horse?.name ?? null })) }));
  }

  private async ownLesson(actor: TrainerTmaActor, id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, include: { bookings: { select: { id: true } } } });
    if (!lesson || (lesson.deletedAt && lesson.status !== 'CANCELLED')) throw new NotFoundException('Занятие не найдено');
    if (actor.role !== 'ADMIN' && lesson.trainerId !== actor.trainerId) throw new ForbiddenException('Можно менять только свои занятия');
    return lesson;
  }

  async status(actor: TrainerTmaActor, id: string, dto: TrainerTmaStatusDto) {
    await this.ownLesson(actor, id);
    // No cash decisions in TMA: paid cancellations require the existing CRM refund flow.
    await this.lessons.updateLessonStatus(id, dto.status, {}, actor, { reason: dto.reason }, actor.telegramUserId);
    return { updated: true };
  }

  async horse(actor: TrainerTmaActor, id: string, dto: TrainerTmaHorseDto) {
    const lesson = await this.ownLesson(actor, id);
    const bookingId = dto.bookingId ?? (lesson.bookings.length === 1 ? lesson.bookings[0].id : undefined);
    if (!bookingId || !lesson.bookings.some(b => b.id === bookingId)) throw new BadRequestException('Выберите участника занятия');
    await this.bookings.replaceHorse(bookingId, dto.horseId, 'Замена тренером через Telegram', actor, actor.telegramUserId);
    return { updated: true };
  }

  horses() {
    return this.prisma.horse.findMany({ where: { status: 'active', healthStatus: 'HEALTHY', isUnavailable: false },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true } });
  }
}
