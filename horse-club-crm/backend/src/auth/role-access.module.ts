import { ModuleAccessService } from '../settings/module-access.service';
import { ModuleAccessGuard } from './module-access.guard';
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RoleAccessService } from './role-access.service';
import { RoleAccessGuard } from './role-access.guard';

@Global()
@Module({ imports: [PrismaModule], providers: [RoleAccessService, RoleAccessGuard, ModuleAccessService, ModuleAccessGuard], exports: [RoleAccessService, RoleAccessGuard, ModuleAccessService, ModuleAccessGuard] })
export class RoleAccessModule {}
