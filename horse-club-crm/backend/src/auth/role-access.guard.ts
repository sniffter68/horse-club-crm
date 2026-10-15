import { ForbiddenException, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest } from './auth.types';
import type { RolePermissions } from './role-access';
import { RoleAccessService } from './role-access.service';

const ACCESS_KEY = 'role-permission';
export const RequirePermission = (permission: keyof RolePermissions) => SetMetadata(ACCESS_KEY, permission);
@Injectable()
export class RoleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: RoleAccessService) {}
  async canActivate(context: ExecutionContext) {
    const permission = this.reflector.getAllAndOverride<keyof RolePermissions>(ACCESS_KEY, [context.getHandler(), context.getClass()]);
    if (!permission) return true;
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user || !(await this.access.permissions(user.role))[permission]) throw new ForbiddenException('У вашей роли нет доступа к этому действию');
    return true;
  }
}
