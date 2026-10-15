import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { defaultRolePermissions, type RolePermissions } from './role-access';

@Injectable()
export class RoleAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async permissions(role: Role, tx: Prisma.TransactionClient = this.prisma): Promise<RolePermissions> {
    // ADMIN and MANAGER retain their existing authority; the TRAINER policy is configurable.
    if (role !== 'TRAINER') return defaultRolePermissions(role);
    const saved = await tx.roleAccess.findUnique({ where: { role } });
    return saved ? { horseReplaceOwn: saved.horseReplaceOwn, horseReplaceAny: false,
      healthRead: saved.healthRead, healthWrite: saved.healthRead && saved.healthWrite,
      financeRead: saved.financeRead, boardingAccess: saved.boardingAccess } : defaultRolePermissions(role);
  }
  async list() {
    return Promise.all((['ADMIN', 'TRAINER'] as const).map(async role => ({ role, ...await this.permissions(role) })));
  }
  async update(role: Role, permissions: RolePermissions) {
    if (role !== 'TRAINER') throw new BadRequestException('Права администратора и менеджера закреплены системной политикой');
    if (permissions.horseReplaceAny) throw new BadRequestException('Заменять лошадей в любых занятиях могут только администратор и менеджер');
    if (permissions.healthWrite && !permissions.healthRead) throw new BadRequestException('Редактирование журнала требует права просмотра');
    return this.prisma.roleAccess.upsert({ where: { role }, create: { role, ...permissions }, update: permissions });
  }
}
