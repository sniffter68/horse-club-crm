import { ForbiddenException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthUser } from './auth.types';

export interface RolePermissions {
  horseReplaceOwn: boolean; horseReplaceAny: boolean;
  healthRead: boolean; healthWrite: boolean; financeRead: boolean; boardingAccess: boolean;
}
export const defaultRolePermissions = (role: Role): RolePermissions => ({
  horseReplaceOwn: role !== 'STABLE_WORKER', horseReplaceAny: (role === 'ADMIN' || role === 'MANAGER'), healthRead: true,
  healthWrite: (role === 'ADMIN' || role === 'MANAGER'), financeRead: (role === 'ADMIN' || role === 'MANAGER'), boardingAccess: true,
});
export function assertHorseReplacement(user: AuthUser, trainerId: string, permissions: RolePermissions) {
  if (!user) throw new ForbiddenException('Недостаточно прав для замены лошади');
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return;
  if (user.role === 'TRAINER' && permissions.horseReplaceOwn && (user.trainerId ?? user.id) === trainerId) return;
  throw new ForbiddenException('Вы можете заменять лошадей только в своих занятиях');
}
