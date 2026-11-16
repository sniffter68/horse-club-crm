import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { TrainerBoardQuery } from './workspace.dto';
import { WorkspaceService } from './workspace.service';

@Controller('workspace')
@RequireModule('SCHEDULE')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}
  @Get('trainer-board') @Roles(Role.TRAINER, Role.ADMIN, Role.MANAGER) @Header('Cache-Control', 'no-store')
  board(@CurrentUser() actor: AuthUser, @Query() query: TrainerBoardQuery) { return this.service.trainerBoard(actor, query.date); }
  @Get('admin-summary') @Roles(Role.ADMIN, Role.MANAGER) @Header('Cache-Control', 'no-store')
  summary(@CurrentUser() actor: AuthUser) { return this.service.adminSummary(actor); }
}
