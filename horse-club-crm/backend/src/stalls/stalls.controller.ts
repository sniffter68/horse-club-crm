import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission, RoleAccessGuard } from '../auth/role-access.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { AssignStallDto } from './dto/assign-stall.dto';
import { TransferStallDto } from './dto/transfer-stall.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { StallsService, type StallWithContracts } from './stalls.service';

@ApiTags('Stalls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard, RoleAccessGuard)
@RequirePermission('boardingAccess')
@RequireModule('STABLES')
@Controller('stalls')
export class StallsController {
  constructor(private readonly service: StallsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER, Role.STABLE_WORKER)
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) response: Response): Promise<StallWithContracts[]> {
    const { data, total } = await this.service.findAll(query);
    setRefineTotalHeaders(response, total);
    return data;
  }

  @Get('map')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER, Role.STABLE_WORKER)
  map() { return this.service.map(); }

  @Get('assignment-horses')
  @Roles(Role.ADMIN, Role.MANAGER)
  assignmentHorses() { return this.service.assignmentHorses(); }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.MANAGER)
  assign(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AssignStallDto) {
    return this.service.assign(id, dto.horseId);
  }

  @Post('transfer/preview')
  @Roles(Role.ADMIN, Role.MANAGER)
  transferPreview(@Body() dto: TransferStallDto) { return this.service.transferPreview(dto); }

  @Post('transfer')
  @Roles(Role.ADMIN, Role.MANAGER)
  transfer(@Body() dto: TransferStallDto, @CurrentUser() user: AuthUser) {
    return this.service.transfer(dto, user.id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER, Role.STABLE_WORKER)
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<StallWithContracts> {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateStallDto): Promise<StallWithContracts> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStallDto): Promise<StallWithContracts> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<StallWithContracts> {
    return this.service.remove(id);
  }
}
