import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission, RoleAccessGuard } from '../auth/role-access.guard';
import { AuthUser } from '../auth/auth.types';
import { BatchVetRecordDto, CreateVetRecordDto, HorseHealthDto, UpdateVetRecordDto, VetRecordQueryDto } from './vet-record.dto';
import { VetRecordService } from './vet-record.service';

@ApiTags('Veterinary records') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RoleAccessGuard) @RequirePermission('healthRead')
@Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER) @Controller('vet')
export class VetRecordController {
  constructor(private readonly service: VetRecordService) {}
  @Get('records') list(@Query() query: VetRecordQueryDto) { return this.service.list(query); }
  @Post('records') @Roles(Role.ADMIN, Role.MANAGER) @RequirePermission('healthWrite')
  create(@Body() dto: CreateVetRecordDto, @Req() req: { user: AuthUser }) { return this.service.create(dto, req.user.id); }
  @Post('records/batch') @Roles(Role.ADMIN, Role.MANAGER) @RequirePermission('healthWrite')
  batch(@Body() dto: BatchVetRecordDto, @Req() req: { user: AuthUser }) { return this.service.batch(dto, req.user.id); }
  @Patch('records/:id') @Roles(Role.ADMIN, Role.MANAGER) @RequirePermission('healthWrite')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateVetRecordDto) { return this.service.update(id, dto); }
  @Delete('records/:id') @Roles(Role.ADMIN)
  remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.remove(id); }
  @Get('summary') summary() { return this.service.summary(); }
  @Patch('horses/:id/health-status') @Roles(Role.ADMIN, Role.MANAGER) @RequirePermission('healthWrite')
  health(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: HorseHealthDto) { return this.service.health(id, dto); }
  @Get('horses/:id/passport') passport(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.passport(id); }
}
