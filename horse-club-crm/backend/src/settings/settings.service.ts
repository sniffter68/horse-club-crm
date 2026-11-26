import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateClubScheduleDto } from './dto/update-club-schedule.dto';
import { scheduleWeekDays } from './club-schedule';
import type { UpdateNotificationsDto } from './dto/update-notifications.dto';
import type { UpdateStallRiskDto } from './dto/update-stall-risk.dto';

const SCHEDULE_ID = 1;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getStallRisk() {
    return this.prisma.clubSchedule.upsert({ where: { id: 1 }, create: { id: 1 }, update: {},
      select: { stallRiskAdjacent: true, stallRiskOpposite: true } });
  }

  updateStallRisk(dto: UpdateStallRiskDto) {
    return this.prisma.clubSchedule.upsert({ where: { id: 1 }, create: { id: 1, ...dto }, update: dto,
      select: { stallRiskAdjacent: true, stallRiskOpposite: true } });
  }

  async getSchedule() {
    const schedule = await this.prisma.clubSchedule.upsert({
      where: { id: SCHEDULE_ID },
      update: {},
      create: { id: SCHEDULE_ID },
    });
    return { ...schedule, weekDays: scheduleWeekDays(schedule) };
  }

  async updateSchedule(dto: UpdateClubScheduleDto) {
    const current = await this.getSchedule();
    const openTime = dto.openTime ?? current.openTime;
    const closeTime = dto.closeTime ?? current.closeTime;
    if (openTime >= closeTime) {
      throw new BadRequestException('Время открытия должно быть раньше времени закрытия');
    }
    if (dto.weekDays && (dto.openTime !== undefined || dto.closeTime !== undefined || dto.daysOfWeekOff !== undefined))
      throw new BadRequestException('Передайте недельный график или прежние поля, без смешивания');
    const weekDays = dto.weekDays ?? current.weekDays.map(day => ({ ...day,
      openTime: dto.openTime ?? day.openTime, closeTime: dto.closeTime ?? day.closeTime,
      isWorkingDay: dto.daysOfWeekOff ? !dto.daysOfWeekOff.includes(day.dayOfWeek % 7) : day.isWorkingDay,
    }));
    if (new Set(weekDays.map(day => day.dayOfWeek)).size !== 7 || weekDays.some(day => day.openTime >= day.closeTime))
      throw new BadRequestException('Укажите все семь дней; закрытие должно быть позже открытия');
    weekDays.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const working = weekDays.filter(day => day.isWorkingDay);
    const hours = working.length ? working : weekDays;
    const saved = await this.prisma.clubSchedule.update({
      where: { id: SCHEDULE_ID },
      data: {
        openTime: hours.map(day => day.openTime).sort()[0],
        closeTime: hours.map(day => day.closeTime).sort().at(-1),
        daysOfWeekOff: weekDays.filter(day => !day.isWorkingDay).map(day => day.dayOfWeek % 7).sort((a, b) => a - b),
        weekDays: weekDays.map(day => ({ ...day })),
      },
    });
    return { ...saved, weekDays: scheduleWeekDays(saved) };
  }

  getNotifications() {
    return this.prisma.clubNotificationSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  async updateNotifications(dto: UpdateNotificationsDto) {
    const current = await this.getNotifications();
    const recipients = dto.adminRecipientIds ?? current.adminRecipientIds;
    if ((dto.adminDigest ?? current.adminDigest) && !recipients.length)
      throw new BadRequestException('Выберите получателей сводки');
    if ((dto.adminDigest ?? current.adminDigest) && recipients.length && await this.prisma.user.count({ where: { id: { in: recipients }, role: 'ADMIN', crmAccess: true, telegramUserId: { not: null } } }) !== recipients.length)
      throw new BadRequestException('Получателями могут быть только активные администраторы с привязанным Telegram');
    return this.prisma.clubNotificationSettings.update({ where: { id: 1 }, data: dto });
  }

  notificationRecipients() {
    return this.prisma.user.findMany({ where: { role: 'ADMIN', crmAccess: true, telegramUserId: { not: null } }, select: { id: true, email: true }, orderBy: { email: 'asc' } });
  }
}
