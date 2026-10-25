import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VK } from 'vk-io';
import { PrismaService } from '../prisma/prisma.service';
import { vkGroupToken } from './vk-bot.config';
import { membershipAccessWhere } from '../memberships/membership-access';

export function parseVkProfile(input: string): { vkId?: string; vkScreenName?: string } {
  let value = input.trim();
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?vk\.(?:com|ru)\//i.test(value)) {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.username || url.password || url.port) throw new BadRequestException('Укажите ссылку на личную страницу VK');
    value = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  }
  value = value.replace(/^@/, '');
  const numeric = /^(?:id)?([1-9]\d{0,14})$/i.exec(value);
  if (numeric) return { vkId: numeric[1] };
  if (!/^[a-z][a-z0-9_.]{1,63}$/i.test(value) || /^(?:id\d|club\d|public\d|event\d)/i.test(value)) {
    throw new BadRequestException('Укажите VK ID или ссылку на личную страницу, например vk.com/id12345678');
  }
  return { vkScreenName: value.toLowerCase() };
}

@Injectable()
export class VkIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  protected async resolveScreenName(screenName: string, token: string) {
    const vk = new VK({ token, apiVersion: '5.199', apiTimeout: 5000, apiRetryLimit: 0 });
    return vk.api.users.get({ user_ids: [screenName] });
  }

  async normalize(input: string | null): Promise<{ vkId: string | null; vkScreenName: string | null }> {
    if (input === null || !input.trim()) return { vkId: null, vkScreenName: null };
    const parsed = parseVkProfile(input);
    if (parsed.vkId) return { vkId: parsed.vkId, vkScreenName: null };
    const token = vkGroupToken();
    if (!token) throw new ServiceUnavailableException('Поиск страницы VK не настроен. Укажите числовой VK ID');
    let users;
    try {
      users = await this.resolveScreenName(parsed.vkScreenName!, token);
    } catch { throw new ServiceUnavailableException('Не удалось проверить страницу VK. Повторите или укажите числовой VK ID'); }
    const user = users[0];
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.deactivated) throw new BadRequestException('Личная страница VK не найдена или недоступна');
    return { vkId: String(user.id), vkScreenName: parsed.vkScreenName! };
  }

  async assertAvailable(tx: Prisma.TransactionClient, vkId: string | null, kind: 'CLIENT' | 'STAFF', id?: string, trainerId?: string | null) {
    if (!vkId) return;
    const [client, user, trainer] = await Promise.all([
      tx.client.findFirst({ where: { OR: [{ vkId }, { vkUserId: BigInt(vkId) }] }, select: { id: true } }),
      tx.user.findFirst({ where: { OR: [{ vkId }, { vkUserId: BigInt(vkId) }] }, select: { id: true } }),
      tx.trainer.findUnique({ where: { vkUserId: BigInt(vkId) }, select: { id: true } }),
    ]);
    if ((client && (kind !== 'CLIENT' || client.id !== id)) || (user && (kind !== 'STAFF' || user.id !== id)) || (trainer && (kind !== 'STAFF' || trainer.id !== trainerId))) {
      throw new ConflictException('Этот VK ID уже привязан к другому клиенту или сотруднику');
    }
  }

  async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034' && attempt < 3) continue;
          if (error.code === 'P2002') throw new ConflictException('Этот VK ID уже привязан к другому клиенту или сотруднику');
        }
        throw error;
      }
    }
  }

  async setTrainer(trainerId: string, input: string | null) {
    const user = await this.prisma.user.findUnique({ where: { trainerId } });
    if (!user) throw new BadRequestException('Сначала привяжите тренера к учетной записи сотрудника');
    return this.setStaff(user.id, input);
  }

  async setStaff(id: string, input: string | null) {
    const { vkId } = await this.normalize(input);
    return this.atomic(tx => this.applyStaff(tx, id, vkId));
  }

  async applyStaff(tx: Prisma.TransactionClient, id: string, vkId: string | null) {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Сотрудник не найден');
    await this.assertAvailable(tx, vkId, 'STAFF', id, user.trainerId);
    const trainer = user.trainerId ? await tx.trainer.findUnique({ where: { id: user.trainerId } }) : null;
    const nextPeer = vkId ? BigInt(vkId) : null;
    const previousPeers = [...new Set([user.vkUserId, trainer?.vkUserId].filter((peer): peer is bigint => peer != null && peer !== nextPeer))];
    if (previousPeers.length) await tx.vkNotification.deleteMany({ where: { peerId: { in: previousPeers }, sentAt: null } });
    if (user.trainerId) await tx.trainer.update({ where: { id: user.trainerId }, data: { vkUserId: nextPeer } });
    return tx.user.update({ where: { id }, data: { vkId, vkUserId: nextPeer },
      select: { id: true, email: true, role: true, trainerId: true, vkId: true, vkUserId: true, createdAt: true, updatedAt: true } });
  }

  async identify(vkId: string) {
    if (!/^[1-9]\d{0,14}$/.test(vkId)) throw new BadRequestException('Укажите числовой VK ID');
    const user = await this.prisma.user.findUnique({ where: { vkId }, include: { staffProfile: true, trainer: true } });
    if (user && user.staffProfile?.isActive !== false && user.trainer?.isActive !== false) return {
      type: 'STAFF' as const, role: user.role, name: user.staffProfile?.fullName || user.trainer?.name || user.email, staffId: user.id, trainerId: user.trainerId,
    };
    const client = await this.prisma.client.findUnique({ where: { vkId } });
    if (!client || client.deletedAt) return { type: 'UNKNOWN' as const };
    const now = new Date();
    const [activeMembershipsCount, nextBooking] = await Promise.all([
      this.prisma.membership.count({ where: { deletedAt: null, status: 'active', validFrom: { lte: now }, validTo: { gte: now }, remainingUnits: { gt: 0 },
        ...membershipAccessWhere(client.id) } }),
      this.prisma.booking.findFirst({ where: { clientId: client.id, status: 'scheduled', startTime: { gte: now }, OR: [{ lessonId: null }, { lesson: { status: 'SCHEDULED', deletedAt: null } }] },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }], select: { id: true, startTime: true, endTime: true, trainer: { select: { name: true } }, horse: { select: { name: true } } } }),
    ]);
    return { type: 'CLIENT' as const, clientId: client.id, name: client.name, activeMembershipsCount, nextBooking };
  }
}
