import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function normalizePhone(input: string): string {
  const phone = parsePhoneNumberFromString(input, 'RU');
  if (!phone?.isValid()) throw new BadRequestException('Укажите корректный номер телефона');
  return phone.number;
}
const digest = (code: string) => createHash('sha256').update(code).digest('hex');
@Injectable()
export class VkLinkService {
  private readonly attempts = new Map<number, { count: number; until: number }>();
  constructor(private readonly prisma: PrismaService) {}
  async issue(kind: 'CLIENT' | 'TRAINER', id: string) {
    const row = kind === 'CLIENT' ? await this.prisma.client.findUnique({ where: { id } }) : await this.prisma.trainer.findUnique({ where: { id } });
    if (!row?.phone) throw new BadRequestException('У записи должен быть указан телефон');
    if (row.vkUserId) throw new ConflictException('Профиль уже привязан');
    const expiresAt = new Date(Date.now() + 5 * 60000);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = randomInt(0, 10000).toString().padStart(4, '0');
      try {
        await this.prisma.$transaction(async tx => {
          await tx.vkLinkCode.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { kind, recordId: id }] } });
          await tx.vkLinkCode.create({ data: { codeHash: digest(code), kind, recordId: id, phone: normalizePhone(row.phone!), expiresAt } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        const group = process.env.VK_GROUP_ID;
        return { code, expiresAt, instruction: `привязать ${normalizePhone(row.phone)} ${code}`,
          communityUrl: group && /^\d+$/.test(group) ? `https://vk.me/club${group}` : null };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException('Не удалось выдать код. Попробуйте ещё раз');
  }
  async unlink(kind: 'CLIENT' | 'TRAINER', id: string) {
    return this.prisma.$transaction(async tx => {
      const target = kind === 'CLIENT' ? await tx.client.findUnique({ where: { id } }) : await tx.trainer.findUnique({ where: { id } });
      if (!target) throw new BadRequestException('Профиль не найден');
      if (kind === 'CLIENT') await tx.client.update({ where: { id }, data: { vkUserId: null } });
      else await tx.trainer.update({ where: { id }, data: { vkUserId: null } });
      await tx.vkLinkCode.deleteMany({ where: { kind, recordId: id } });
      if (target.vkUserId) await tx.vkNotification.deleteMany({ where: { peerId: target.vkUserId, sentAt: null } });
      return { success: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async bind(sender: number, phoneInput: string, code: string): Promise<'CLIENT' | 'TRAINER'> {
    // Short codes still require the profile's phone; cap guesses per VK account.
    for (const [id, entry] of this.attempts) if (entry.until < Date.now()) this.attempts.delete(id);
    const attempt = this.attempts.get(sender) ?? { count: 0, until: Date.now() + 15 * 60000 };
    if (attempt.count >= 5 || (!this.attempts.has(sender) && this.attempts.size >= 10000)) throw new BadRequestException('Слишком много попыток. Попробуйте через 15 минут');
    attempt.count += 1;
    this.attempts.set(sender, attempt);
    const phone = normalizePhone(phoneInput);
    const kind = await this.prisma.$transaction(async tx => {
      const grant = await tx.vkLinkCode.findUnique({ where: { codeHash: digest(code) } });
      if (!grant || grant.phone !== phone || grant.expiresAt < new Date() || (grant.usedBy !== null && grant.usedBy !== BigInt(sender))) {
        throw new BadRequestException('Код недействителен или истёк');
      }
      const [clientBinding, trainerBinding] = await Promise.all([
        tx.client.findUnique({ where: { vkUserId: BigInt(sender) } }), tx.trainer.findUnique({ where: { vkUserId: BigInt(sender) } }),
      ]);
      if ((clientBinding && (grant.kind !== 'CLIENT' || clientBinding.id !== grant.recordId)) || (trainerBinding && (grant.kind !== 'TRAINER' || trainerBinding.id !== grant.recordId))) {
        throw new ConflictException('VK уже связан с другим профилем');
      }
      const target = grant.kind === 'CLIENT' ? await tx.client.findUnique({ where: { id: grant.recordId } }) : await tx.trainer.findUnique({ where: { id: grant.recordId } });
      if (!target?.phone || normalizePhone(target.phone) !== phone || (target.vkUserId !== null && target.vkUserId !== BigInt(sender))) throw new ConflictException('Профиль изменён или уже привязан');
      if (grant.kind === 'CLIENT') await tx.client.update({ where: { id: target.id }, data: { vkUserId: BigInt(sender) } });
      else await tx.trainer.update({ where: { id: target.id }, data: { vkUserId: BigInt(sender) } });
      await tx.vkLinkCode.update({ where: { id: grant.id }, data: { usedBy: BigInt(sender) } });
      return grant.kind === 'CLIENT' ? 'CLIENT' : 'TRAINER';
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    this.attempts.delete(sender);
    return kind;
  }
}
