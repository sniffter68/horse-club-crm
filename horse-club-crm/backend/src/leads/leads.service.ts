import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './create-lead.dto';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLeadDto): Promise<{ success: true; clientId: string; message: string }> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          if (dto.serviceId && !await tx.service.findUnique({ where: { id: dto.serviceId }, select: { id: true } })) {
            throw new NotFoundException('Услуга не найдена');
          }
          const existing = await tx.client.findUnique({ where: { phone: dto.phone } });
          // A public submission may fill missing contact details, but must not replace
          // an existing identity, medical data or verified VK binding by knowing a phone.
          const client = existing
            ? await tx.client.update({ where: { id: existing.id }, data: {
                ...(!existing.firstName ? { firstName: dto.firstName, name: [dto.firstName, existing.lastName].filter(Boolean).join(' ') } : {}),
                ...(!existing.email && dto.email ? { email: dto.email } : {}),
                ...(!existing.preferences && dto.preferences ? { preferences: dto.preferences } : {}),
              } })
            : await tx.client.create({ data: { firstName: dto.firstName, name: dto.firstName, phone: dto.phone, email: dto.email, preferences: dto.preferences, isRider: true, isLead: true } });
          if (dto.serviceId) await tx.leadRequest.upsert({
            where: { clientId_serviceId: { clientId: client.id, serviceId: dto.serviceId } },
            create: { clientId: client.id, serviceId: dto.serviceId }, update: {},
          });
          await this.notifyAdministrator(tx, client.id, dto);
          return { success: true as const, clientId: client.id, message: 'Заявка успешно принята' };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
  }

  async notifyAdministrator(tx: Prisma.TransactionClient, clientId: string, dto: CreateLeadDto): Promise<void> {
    const peer = Number(process.env.VK_ADMIN_PEER_ID);
    if (!Number.isSafeInteger(peer) || peer <= 0) return;
    await tx.vkNotification.upsert({
      where: { key: `lead:${clientId}:${dto.serviceId ?? 'general'}` }, update: {},
      create: { key: `lead:${clientId}:${dto.serviceId ?? 'general'}`, peerId: BigInt(peer),
        message: `Новая заявка: ${dto.firstName}\nТелефон: ${dto.phone}\nКлиент: ${clientId}${dto.serviceId ? `\nУслуга: ${dto.serviceId}` : ''}` },
    });
  }
}
