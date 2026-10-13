import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import type { BoardingQueryDto, CreateBoardingLogDto } from './boarding.dto';

export const billingMonth = (now: Date) => DateTime.fromJSDate(now, { zone: process.env.CLUB_TIME_ZONE || 'Europe/Moscow' }).toFormat('yyyy-MM');
export async function serializable<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 }); }
    catch (error) {
      if (attempt < 4 && (isSerializationFailure(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))) continue;
      throw error;
    }
  }
}
export function period(query: BoardingQueryDto) {
  if (query.from && query.to && new Date(query.from) > new Date(query.to)) throw new BadRequestException('Начало периода должно быть раньше окончания');
  return { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
}

@Injectable()
export class BoardingBillingService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(BoardingBillingService.name);
  onModuleInit() {
    if (process.env.NODE_ENV !== 'production' || process.env.BOARDING_BILLING_ENABLED === 'false') return;
    void this.tick(); this.timer = setInterval(() => { void this.tick(); }, 3600000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.triggerMonthlyBoardingBilling(); }
    catch (error) { this.logger.error('Не удалось начислить постой; повтор через час', error instanceof Error ? error.stack : undefined); }
    finally { this.running = false; }
  }
  async triggerMonthlyBoardingBilling(now = new Date()) {
    const month = billingMonth(now);
    // Current occupied stalls only; full agreed rate, no retroactive/prorated charges.
    const contracts = await this.prisma.boardingContract.findMany({ where: {
      status: 'ACTIVE', stallId: { not: null }, clientId: { not: null }, monthlyRate: { gt: 0 },
      startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], horse: { ownerType: 'private' },
    }, select: { id: true }, orderBy: { id: 'asc' } });
    let charged = 0;
    const chargedContractIds: string[] = [];
    for (const { id } of contracts) {
      const result = await serializable(this.prisma, async tx => {
        await tx.$queryRaw`SELECT "id" FROM "BoardingContract" WHERE "id"=${id}::uuid FOR UPDATE`;
        const contract = await tx.boardingContract.findUniqueOrThrow({ where: { id }, include: { horse: true } });
        if (contract.status !== 'ACTIVE' || !contract.clientId || !contract.stallId || contract.horse.ownerType !== 'private'
          || contract.startsAt > now || (contract.endsAt && contract.endsAt <= now) || contract.monthlyRate.lte(0)) return false;
        if (await tx.ledgerTransaction.findUnique({ where: { boardingContractId_billingMonth: { boardingContractId: id, billingMonth: month } } })) return false;
        await tx.ledgerTransaction.create({ data: { clientId: contract.clientId, boardingContractId: id, billingMonth: month,
          transactionType: 'boarding_charge', amount: contract.monthlyRate.negated(), description: `Постой: ${contract.horse.name}, ${month}` } });
        return true;
      });
      if (result) { charged++; chargedContractIds.push(id); }
    }
    return { month, charged, chargedContractIds };
  }
}

@Injectable()
export class BoardingServicesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(dto: CreateBoardingLogDto, actor: string) {
    return serializable(this.prisma, async tx => {
      // Serializes retries with the same request key, including across horses.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId}, 1))::text AS lock`;
      const previous = await tx.boardingDailyLog.findUnique({ where: { requestId: dto.requestId } });
      if (previous) {
        if (previous.horseId !== dto.horseId || previous.serviceType !== dto.serviceType || !previous.cost.eq(dto.cost)
          || (previous.notes ?? '') !== (dto.notes?.trim() || '') || (dto.performedAt && +previous.performedAt !== +new Date(dto.performedAt))) {
          throw new ConflictException('Этот запрос уже использован для другой услуги');
        }
        return previous;
      }
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id"=${dto.horseId}::uuid FOR UPDATE`;
      const horse = await tx.horse.findUnique({ where: { id: dto.horseId } });
      if (!horse) throw new NotFoundException('Лошадь не найдена');
      const performedAt = dto.performedAt ? new Date(dto.performedAt) : new Date();
      if (performedAt > new Date()) throw new BadRequestException('Выполненная услуга не может быть в будущем');
      const contract = await tx.boardingContract.findFirst({ where: { horseId: horse.id, status: { in: ['ACTIVE', 'SUSPENDED'] },
        startsAt: { lte: performedAt }, OR: [{ endsAt: null }, { endsAt: { gt: performedAt } }] }, orderBy: { startsAt: 'desc' } });
      if (horse.ownerType !== 'private' || !contract?.clientId) throw new ConflictException('Для платной услуги нужен действующий частный постой с владельцем');
      const log = await tx.boardingDailyLog.create({ data: { horseId: horse.id, clientId: contract.clientId,
        serviceType: dto.serviceType, cost: dto.cost, performedAt, performedBy: actor, notes: dto.notes?.trim() || null, requestId: dto.requestId } });
      await tx.ledgerTransaction.create({ data: { clientId: log.clientId, boardingContractId: contract.id, boardingDailyLogId: log.id,
        transactionType: 'boarding_charge', amount: log.cost.negated(), description: `Доп. услуга: ${log.serviceType} — ${horse.name}` } });
      return log;
    });
  }
  async logs(query: BoardingQueryDto) {
    const where: Prisma.BoardingDailyLogWhereInput = { horseId: query.horseId, performedAt: period(query) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.boardingDailyLog.findMany({ where, include: { horse: { select: { id: true, name: true } } },
        orderBy: [{ performedAt: 'desc' }, { id: 'asc' }], skip: query.offset, take: query.limit }),
      this.prisma.boardingDailyLog.count({ where }),
    ]);
    return { data, total };
  }
  async expenses(query: BoardingQueryDto) {
    const where: Prisma.LedgerTransactionWhereInput = { boardingContract: { horseId: query.horseId }, createdAt: period(query) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ledgerTransaction.findMany({ where, include: { boardingDailyLog: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: query.offset, take: query.limit }),
      this.prisma.ledgerTransaction.count({ where }),
    ]);
    const horse = query.horseId ? await this.prisma.horse.findUnique({ where: { id: query.horseId }, select: { boardingContracts: {
      where: { status: { in: ['ACTIVE','SUSPENDED'] }, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      select: { client: { select: { id: true, boardingBalance: true } } }, take: 1 } } }) : null;
    return { data, total, ownerAccount: horse?.boardingContracts[0]?.client ?? null };
  }
}
