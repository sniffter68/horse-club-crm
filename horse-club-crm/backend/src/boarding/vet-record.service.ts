import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VetRecordType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from './boarding.service';
import { BatchVetRecordDto, CreateVetRecordDto, HorseHealthDto, UpdateVetRecordDto, VetRecordQueryDto } from './vet-record.dto';

export const VET_INTERVALS: Partial<Record<VetRecordType, number>> = { DEWORMING: 90, FARRIER: 45, BLOOD_TEST: 180, VACCINATION: 365, DENTAL: 365 };
const zone = 'Europe/Moscow';
const clubDate = (value: string) => DateTime.fromISO(value, { zone }).toJSDate();
export function nextVetDate(type: VetRecordType, date: Date) {
  const days = VET_INTERVALS[type];
  return days ? DateTime.fromJSDate(date, { zone }).plus({ days }).toJSDate() : null;
}
export function vetDueStatus(date: Date | null, now = new Date()) {
  if (!date) return 'none';
  const today = DateTime.fromJSDate(now, { zone }).startOf('day');
  const due = DateTime.fromJSDate(date, { zone }).startOf('day');
  return due < today ? 'overdue' : due <= today.plus({ days: 30 }) ? 'soon' : 'current';
}
const include = { horse: { select: { id: true, name: true, healthStatus: true, quarantineUntil: true } }, createdBy: { select: { id: true, email: true } } } satisfies Prisma.VetRecordInclude;

@Injectable()
export class VetRecordService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: VetRecordQueryDto) {
    const from = query.from ? clubDate(query.from) : undefined;
    const to = query.to ? /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? DateTime.fromISO(query.to, { zone }).endOf('day').toJSDate() : clubDate(query.to) : undefined;
    if (from && to && from > to) throw new BadRequestException('Начало периода позже окончания');
    const where: Prisma.VetRecordWhereInput = { horseId: query.horseId, type: query.type, performedAt: {
      ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}),
    } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vetRecord.findMany({ where, include, orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip: query.offset ?? 0, take: query.limit ?? 20 }),
      this.prisma.vetRecord.count({ where }),
    ]);
    return { data: data.map(r => ({ ...r, dueStatus: vetDueStatus(r.nextDueDate) })), total };
  }
  private data(dto: CreateVetRecordDto | UpdateVetRecordDto, current?: { type: VetRecordType; performedAt: Date; nextDueDate: Date | null }) {
    const performedAt = dto.performedAt ? clubDate(dto.performedAt) : current!.performedAt;
    const type = dto.type ?? current!.type;
    if (performedAt > new Date()) throw new BadRequestException('Выполненная процедура не может быть в будущем');
    const nextDueDate = dto.nextDueDate !== undefined ? dto.nextDueDate === null ? null : clubDate(dto.nextDueDate)
      : !current || dto.type !== undefined || dto.performedAt !== undefined ? nextVetDate(type, performedAt) : current.nextDueDate;
    if (nextDueDate && nextDueDate <= performedAt) throw new BadRequestException('Следующая процедура должна быть позже выполненной');
    return { ...dto, type, performedAt, nextDueDate };
  }
  private async lockHorses(tx: Prisma.TransactionClient, ids: string[]) {
    for (const id of [...new Set(ids)].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id"=${id}::uuid FOR UPDATE`;
      if (!await tx.horse.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Лошадь не найдена');
    }
  }
  create(dto: CreateVetRecordDto, author: string) {
    return serializable(this.prisma, async tx => {
      await this.lockHorses(tx, [dto.horseId]);
      return tx.vetRecord.create({ data: { ...this.data(dto), title: dto.title, specialist: dto.specialist, horseId: dto.horseId, createdById: author }, include });
    });
  }
  batch(dto: BatchVetRecordDto, author: string) {
    if (!['VACCINATION', 'DEWORMING'].includes(dto.type)) throw new BadRequestException('Массовая запись доступна для вакцинации и дегельминтизации');
    const { horseIds, horseId: _unused, ...details } = dto;
    return serializable(this.prisma, async tx => {
      await this.lockHorses(tx, horseIds);
      const records = [];
      for (const horseId of horseIds) records.push(await tx.vetRecord.create({ data: { ...this.data({ ...details, horseId }), title: details.title, specialist: details.specialist, horseId, createdById: author }, include }));
      return { data: records, total: records.length };
    });
  }
  update(id: string, dto: UpdateVetRecordDto) {
    if (Object.values(dto).some(value => value === null) && ['horseId', 'type', 'title', 'performedAt', 'specialist'].some(key => (dto as Record<string, unknown>)[key] === null)) throw new BadRequestException('Обязательные поля нельзя очищать');
    return serializable(this.prisma, async tx => {
      const current = await tx.vetRecord.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Ветзапись не найдена');
      await this.lockHorses(tx, [current.horseId, dto.horseId ?? current.horseId]);
      return tx.vetRecord.update({ where: { id }, data: this.data(dto, current), include });
    });
  }
  async remove(id: string) {
    try { return await this.prisma.vetRecord.delete({ where: { id } }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('Ветзапись не найдена'); throw error; }
  }
  health(id: string, dto: HorseHealthDto) {
    const quarantineUntil = dto.quarantineUntil ? /^\d{4}-\d{2}-\d{2}$/.test(dto.quarantineUntil)
      ? DateTime.fromISO(dto.quarantineUntil, { zone }).endOf('day').toJSDate() : clubDate(dto.quarantineUntil) : null;
    if (dto.quarantineUntil && dto.healthStatus !== 'QUARANTINE') throw new BadRequestException('Срок карантина доступен только для карантина');
    if (quarantineUntil && quarantineUntil < new Date()) throw new BadRequestException('Срок карантина не может быть в прошлом');
    return serializable(this.prisma, async tx => {
      await this.lockHorses(tx, [id]);
      const status = { HEALTHY: 'active', TREATMENT: 'sick', QUARANTINE: 'quarantine', RETIRED: 'rest' } as const;
      return tx.horse.update({ where: { id }, data: { healthStatus: dto.healthStatus, quarantineUntil: dto.healthStatus === 'QUARANTINE' ? quarantineUntil : null,
        status: status[dto.healthStatus], isUnavailable: dto.healthStatus !== 'HEALTHY' } });
    });
  }
  async summary(now = new Date()) {
    const today = DateTime.fromJSDate(now, { zone }).startOf('day');
    // Latest record per horse/type/title supersedes that procedure's previous deadline.
    const [records, restrictedHorses] = await this.prisma.$transaction([
      this.prisma.vetRecord.findMany({ distinct: ['horseId', 'type', 'title'], orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], include }),
      this.prisma.horse.findMany({ where: { healthStatus: { in: ['TREATMENT', 'QUARANTINE', 'RETIRED'] } }, select: { id: true, name: true, healthStatus: true, quarantineUntil: true }, orderBy: { name: 'asc' } }),
    ]);
    const pending = records.filter(r => r.nextDueDate).sort((a, b) => +a.nextDueDate! - +b.nextDueDate!);
    const overdue = pending.filter(r => vetDueStatus(r.nextDueDate, now) === 'overdue');
    const between = (days: number) => pending.filter(r => r.nextDueDate! >= today.toJSDate() && r.nextDueDate! < today.plus({ days: days + 1 }).toJSDate());
    const thisMonth = pending.filter(r => r.nextDueDate! >= today.startOf('month').toJSDate() && r.nextDueDate! < today.plus({ months: 1 }).startOf('month').toJSDate());
    return { overdue, next14Days: between(14), next30Days: between(30), thisMonth, restrictedHorses, timeZone: zone };
  }
  async passport(id: string) {
    const horse = await this.prisma.horse.findUnique({ where: { id }, include: {
      vetRecords: { include, orderBy: [{ performedAt: 'desc' }, { id: 'desc' }] },
      vetEvents: { orderBy: [{ eventDate: 'desc' }, { id: 'desc' }] }, healthLogs: { orderBy: { occurredAt: 'desc' } },
    } });
    if (!horse) throw new NotFoundException('Лошадь не найдена');
    return { horse, generatedAt: new Date(), timeZone: zone };
  }
}
