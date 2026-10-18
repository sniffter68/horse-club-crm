import { BadRequestException, Injectable } from '@nestjs/common';
import { AccessLevel, Role, SystemModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const systemModules = Object.values(SystemModule);
export function defaultModuleAccess(role: Role, module: SystemModule): AccessLevel {
  if (role === Role.ADMIN || role === Role.MANAGER) return AccessLevel.FULL;
  if (role === Role.TRAINER && module === SystemModule.SCHEDULE) return AccessLevel.FULL;
  if ((role === Role.TRAINER || role === Role.STABLE_WORKER) &&
    (module === SystemModule.STABLES || module === SystemModule.VETERINARY)) return AccessLevel.READ_ONLY;
  return AccessLevel.HIDDEN;
}

@Injectable()
export class ModuleAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async forRole(role: Role) {
    const [settings, permissions] = await Promise.all([
      this.prisma.clubModuleSettings.findMany(),
      this.prisma.roleModulePermission.findMany({ where: { role } }),
    ]);
    return systemModules.map(module => ({ module,
      isEnabled: settings.find(row => row.module === module)?.isEnabled ?? true,
      accessLevel: role === Role.ADMIN ? AccessLevel.FULL :
        permissions.find(row => row.module === module)?.accessLevel ?? defaultModuleAccess(role, module),
    }));
  }
  async list() {
    const [settings, saved] = await Promise.all([
      this.prisma.clubModuleSettings.findMany(), this.prisma.roleModulePermission.findMany(),
    ]);
    return {
      modules: systemModules.map(module => ({ module, isEnabled: settings.find(row => row.module === module)?.isEnabled ?? true })),
      permissions: Object.values(Role).flatMap(role => systemModules.map(module => ({ role, module,
        accessLevel: role === Role.ADMIN ? AccessLevel.FULL : saved.find(row => row.role === role && row.module === module)?.accessLevel ?? defaultModuleAccess(role, module),
      }))),
    };
  }
  toggle(module: SystemModule, isEnabled: boolean) {
    return this.prisma.clubModuleSettings.upsert({ where: { module }, create: { module, isEnabled }, update: { isEnabled } });
  }
  async updatePermissions(permissions: Array<{ role: Role; module: SystemModule; accessLevel: AccessLevel }>) {
    if (permissions.some(row => row.role === Role.ADMIN && row.accessLevel !== AccessLevel.FULL))
      throw new BadRequestException('Администратор всегда имеет полный доступ');
    const keys = permissions.map(row => `${row.role}:${row.module}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Повторяющиеся права роли и модуля');
    await this.prisma.$transaction(permissions.map(row => this.prisma.roleModulePermission.upsert({
      where: { role_module: { role: row.role, module: row.module } }, create: row, update: { accessLevel: row.accessLevel },
    })));
    return this.list();
  }
}
