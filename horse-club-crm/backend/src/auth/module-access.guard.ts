import { ForbiddenException, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessLevel, type SystemModule } from '@prisma/client';
import { ModuleAccessService } from '../settings/module-access.service';
import type { AuthRequest } from './auth.types';

export const MODULE_ACCESS_KEY = 'system-module';
export const RequireModule = (module: SystemModule, minAccessLevel: AccessLevel = AccessLevel.READ_ONLY) =>
  SetMetadata(MODULE_ACCESS_KEY, { module, minAccessLevel });
export const RequireModuleForFields = (module: SystemModule, fields: string[]) => SetMetadata('system-module-fields', { module, fields });
// This exception is only for a controller that scopes all data to the authenticated account.
export const PersonalModuleAccess = () => SetMetadata('personal-module-access', true);

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: ModuleAccessService) {}
  async canActivate(context: ExecutionContext) {
    let required = this.reflector.getAllAndOverride<{ module: SystemModule; minAccessLevel: AccessLevel }>(
      MODULE_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthRequest & { method: string; body?: Record<string, unknown> }>();
    const fieldPolicy = this.reflector.getAllAndOverride<{ module: SystemModule; fields: string[] }>('system-module-fields', [context.getHandler(), context.getClass()]);
    if (!required && fieldPolicy?.fields.some(field => Object.prototype.hasOwnProperty.call(request.body ?? {}, field)))
      required = { module: fieldPolicy.module, minAccessLevel: AccessLevel.FULL };
    if (!required) return true;
    if (!request.user) throw new ForbiddenException('Требуется авторизация');
    const permission = (await this.access.forRole(request.user.role)).find(row => row.module === required.module);
    if (!permission?.isEnabled) throw new ForbiddenException('Модуль временно отключен в настройках клуба');
    const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    const personal = read && this.reflector.get<boolean>('personal-module-access', context.getHandler());
    if (!personal && permission.accessLevel === AccessLevel.HIDDEN) throw new ForbiddenException('У вашей роли нет доступа к этому разделу');
    if ((!read || required.minAccessLevel === AccessLevel.FULL) && permission.accessLevel !== AccessLevel.FULL)
      throw new ForbiddenException('Недостаточно прав для редактирования');
    return true;
  }
}
