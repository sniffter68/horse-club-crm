import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RoleAccessService } from './role-access.service';
import { RoleAccessGuard } from './role-access.guard';

@Global()
@Module({ imports: [PrismaModule], providers: [RoleAccessService, RoleAccessGuard], exports: [RoleAccessService, RoleAccessGuard] })
export class RoleAccessModule {}
