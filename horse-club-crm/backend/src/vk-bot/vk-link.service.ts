import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
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
  constructor(private readonly prisma: PrismaService) {}
  async issue(kind: 'CLIENT' | 'TRAINER', id: string) {
    const row = kind === 'CLIENT' ? await this.prisma.client.findUnique({ where: { id } }) : await this.prisma.trainer.findUnique({ where: { id } });
    if (!row?.phone) throw new BadRequestException('У записи должен быть указан телефон');
    if (row.vkUserId) throw new ConflictException('Профиль уже привязан');
    const code = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60000);
    await this.prisma.vkLinkCode.create({ data: { codeHash: digest(code), kind, recordId: id, phone: normalizePhone(row.phone), expiresAt } });
    return { code, expiresAt, instruction: `привязать ${normalizePhone(row.phone)} ${code}` };
  }
  async bind(sender: number, phoneInput: string, code: string): Promise<'CLIENT' | 'TRAINER'> {
    const phone = normalizePhone(phoneInput);
    return this.prisma.$transaction(async tx => {
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
  }
}
