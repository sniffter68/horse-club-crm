import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { LeadRequestStatus, Prisma } from '@prisma/client';
import { queueVkNotification } from '../vk-bot/vk-delivery.module';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptLeadDto } from './accept-lead.dto';
import type { CreateLeadDto } from './create-lead.dto';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLeadDto, consentSource: 'LANDING' | 'VK' = 'LANDING'): Promise<{ success: true; leadId: string; message: string }> {
    if (process.env.PUBLIC_LEADS_ENABLED !== 'true' && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Приём заявок временно отключён');
    }
    const currentConsentVersion = process.env.LEAD_CONSENT_VERSION?.trim() || '2026-09-19';
    if (dto.consentVersion !== currentConsentVersion) {
      throw new BadRequestException('Текст согласия обновился. Обновите страницу и подтвердите актуальную редакцию');
    }
    const consentedAt = new Date();
    return this.retrySerializable(async tx => {
      if (dto.serviceId && !await tx.service.findUnique({ where: { id: dto.serviceId }, select: { id: true } })) {
        throw new NotFoundException('Услуга не найдена');
      }
      const pending = await tx.leadRequest.findFirst({
        where: { phone: dto.phone, status: LeadRequestStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });
      const lead = pending
        ? pending
        : await tx.leadRequest.create({
            data: {
              firstName: dto.firstName,
              phone: dto.phone,
              email: dto.email,
              preferences: dto.preferences,
              serviceId: dto.serviceId,
              consentVersion: dto.consentVersion,
              consentedAt,
              consentSource,
            },
          });
      if (!pending) await this.notifyAdministrator(tx, lead.id, dto);
      return { success: true as const, leadId: '', message: 'Заявка успешно принята' };
    });
  }

  async accept(id: string, dto: AcceptLeadDto) {
    return this.retrySerializable(async tx => {
      const lead = await tx.leadRequest.findUnique({ where: { id } });
      if (!lead) throw new NotFoundException('Заявка не найдена');
      if (lead.status !== LeadRequestStatus.PENDING) throw new BadRequestException('Заявка уже обработана');

      const existing = await tx.client.findUnique({ where: { phone: dto.phone } });
      const data = {
        firstName: dto.firstName,
        lastName: dto.lastName?.trim() ?? '',
        name: [dto.firstName, dto.lastName?.trim()].filter(Boolean).join(' '),
        phone: dto.phone,
        email: dto.email?.trim() || null,
        preferences: dto.preferences?.trim() || null,
        isRider: dto.isRider,
        isPayer: dto.isPayer,
        isLead: false,
      };
      const client = existing
        ? await tx.client.update({ where: { id: existing.id }, data })
        : await tx.client.create({ data });
      await tx.leadRequest.update({
        where: { id },
        data: { status: LeadRequestStatus.ACCEPTED, clientId: client.id, processedAt: new Date() },
      });
      return { success: true as const, client, message: 'Клиент создан' };
    });
  }

  async reject(id: string) {
    const lead = await this.prisma.leadRequest.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    if (lead.status !== LeadRequestStatus.PENDING) throw new BadRequestException('Заявка уже обработана');
    const changed = await this.prisma.leadRequest.updateMany({
      where: { id, status: LeadRequestStatus.PENDING },
      data: { status: LeadRequestStatus.REJECTED, processedAt: new Date() },
    });
    if (changed.count !== 1) throw new BadRequestException('Заявка уже обработана');
    return { success: true as const, message: 'Заявка отклонена' };
  }

  private async notifyAdministrator(tx: Prisma.TransactionClient, leadId: string, dto: CreateLeadDto): Promise<void> {
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', vkUserId: { not: null } }, select: { vkUserId: true } });
    const recipients = new Set(admins.flatMap(admin => admin.vkUserId ? [admin.vkUserId] : []));
    const peer = Number(process.env.VK_ADMIN_PEER_ID);
    if (Number.isSafeInteger(peer) && peer > 0) recipients.add(BigInt(peer));
    if (!recipients.size) return;
    const service = dto.serviceId ? await tx.service.findUnique({ where: { id: dto.serviceId }, select: { title: true, name: true } }) : null;
    for (const recipient of recipients) {
      await queueVkNotification(tx, `lead:${leadId}:${recipient}`, recipient,
        `🐎 Новая заявка: ${dto.firstName}, ${dto.phone}, ${service?.title || service?.name || 'Услуга не выбрана'}`);
    }
  }

  private async retrySerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: unknown) {
        if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
  }
}
