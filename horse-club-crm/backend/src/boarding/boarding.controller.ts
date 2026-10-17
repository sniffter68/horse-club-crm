import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BoardingBillingService, BoardingServicesService } from './boarding.service';
import { VetCalendarService } from './vet-calendar.service';
import { VetRecordService } from './vet-record.service';
import { BoardingQueryDto, CompleteVetEventDto, CreateBoardingLogDto, CreateVetEventDto, VetQueryDto } from './boarding.dto';
import { RequirePermission, RoleAccessGuard } from '../auth/role-access.guard';

@ApiTags('Boarding') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, RoleAccessGuard) @RequirePermission('boardingAccess')
@Roles(Role.ADMIN, Role.MANAGER) @Controller('boarding')
export class BoardingServicesController {
  constructor(private readonly service: BoardingServicesService, private readonly billing: BoardingBillingService) {}
  @Post('logs') create(@Body() dto: CreateBoardingLogDto, @Req() request: { user: { sub?: string; userId?: string; email?: string } }) {
    return this.service.create(dto, request.user.email || request.user.sub || request.user.userId || 'staff');
  }
  @Get('logs') logs(@Query() query: BoardingQueryDto) { return this.service.logs(query); }
  @Get('expenses') expenses(@Query() query: BoardingQueryDto) { return this.service.expenses(query); }
  @Post('billing/monthly') @Roles(Role.ADMIN) bill() { return this.billing.triggerMonthlyBoardingBilling(); }
}

@ApiTags('Veterinary calendar') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, RoleAccessGuard) @RequirePermission('healthRead')
@Controller('vet')
export class VetCalendarController {
  constructor(private readonly service: VetCalendarService, private readonly records: VetRecordService) {}
  @Get('upcoming') @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async upcoming(@Query() query: VetQueryDto) {
    const [calendar, summary] = await Promise.all([this.service.list(query, true), this.records.summary()]);
    return { ...calendar, ...summary };
  }
  @Get('events') @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  list(@Query() query: VetQueryDto) { return this.service.list(query); }
  @Post('events') @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER) @RequirePermission('healthWrite')
  create(@Body() dto: CreateVetEventDto) { return this.service.create(dto); }
  @Patch('events/:id/complete') @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER) @RequirePermission('healthWrite')
  complete(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CompleteVetEventDto) { return this.service.complete(id, dto); }
}
