import { BadRequestException, Injectable } from '@nestjs/common';
import type { ClubSchedule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateClubScheduleDto } from './dto/update-club-schedule.dto';

const SCHEDULE_ID = 1;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getSchedule(): Promise<ClubSchedule> {
    return this.prisma.clubSchedule.upsert({
      where: { id: SCHEDULE_ID },
      update: {},
      create: { id: SCHEDULE_ID },
    });
  }

  async updateSchedule(dto: UpdateClubScheduleDto): Promise<ClubSchedule> {
    const current = await this.getSchedule();
    const openTime = dto.openTime ?? current.openTime;
    const closeTime = dto.closeTime ?? current.closeTime;
    if (openTime >= closeTime) {
      throw new BadRequestException('Время открытия должно быть раньше времени закрытия');
    }
    return this.prisma.clubSchedule.update({
      where: { id: SCHEDULE_ID },
      data: dto,
    });
  }
}
