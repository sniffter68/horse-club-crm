import { ModuleAccessGuard, RequireModule, PersonalModuleAccess } from '../auth/module-access.guard';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import { DutyDto, StaffQueryDto, CreateShiftDto, PayoutDto, PayrollQueryDto, SavePayrollDto, ShiftQueryDto, StaffProfileDto, UpdateShiftDto, UpdateStaffProfileDto } from './staff.dto';
import { StaffService } from './staff.service';

@RequireModule('STAFF_PAYROLL')
@Controller('staff')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER, Role.STABLE_WORKER, Role.GROOM, Role.VET, Role.OTHER)
export class StaffController {
  constructor(private readonly service: StaffService) {}
  @Get() profiles(@Query() query: StaffQueryDto, @Req() req: { user: AuthUser }) { return this.service.profiles(req.user, query); }
  @Get('candidates') @Roles(Role.ADMIN, Role.MANAGER)
  candidates(@Req() req: { user: AuthUser }) { return this.service.candidates(req.user); }
  @Post() @Roles(Role.ADMIN, Role.MANAGER)
  createProfile(@Body() dto: StaffProfileDto, @Req() req: { user: AuthUser }) { return this.service.saveProfile(dto, req.user); }
  @Patch(':id') @Roles(Role.ADMIN, Role.MANAGER)
  updateProfile(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStaffProfileDto, @Req() req: { user: AuthUser }) { return this.service.saveProfile(dto, req.user, id); }
  @Post(':id/archive') @Roles(Role.ADMIN, Role.MANAGER)
  archive(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: { user: AuthUser }) { return this.service.archive(id, req.user); }
  @Get('shifts') shifts(@Query() query: ShiftQueryDto, @Req() req: { user: AuthUser }) { return this.service.shifts(query, req.user); }
  @Post('shifts') @Roles(Role.ADMIN, Role.MANAGER)
  createShifts(@Body() dto: CreateShiftDto, @Req() req: { user: AuthUser }) { return this.service.createShifts(dto, req.user); }
  @Patch('shifts/:id') @Roles(Role.ADMIN, Role.MANAGER)
  updateShift(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateShiftDto, @Req() req: { user: AuthUser }) { return this.service.changeShift(id, dto, req.user); }
  @Delete('shifts/:id') @Roles(Role.ADMIN)
  deleteShift(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: { user: AuthUser }) { return this.service.changeShift(id, null, req.user); }
}

@RequireModule('STAFF_PAYROLL')
@Controller('payroll')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
export class PayrollController {
  constructor(private readonly service: StaffService) {}
  @Get('me') @Roles(Role.TRAINER, Role.STABLE_WORKER) @PersonalModuleAccess()
  mine(@Query() query: PayrollQueryDto, @Req() req: { user: AuthUser }) { return this.service.calculate(query, req.user); }
  @Get('calculate') calculate(@Query() query: PayrollQueryDto, @Req() req: { user: AuthUser }) { return this.service.calculate(query, req.user); }
  @Post('calculations') @Roles(Role.ADMIN, Role.MANAGER)
  save(@Body() dto: SavePayrollDto, @Req() req: { user: AuthUser }) { return this.service.savePayroll(dto, req.user); }
  @Post('payout') @Roles(Role.ADMIN, Role.MANAGER)
  payout(@Body() dto: PayoutDto, @Req() req: { user: AuthUser }) { return this.service.payout(dto, req.user); }
}

@RequireModule('STAFF_PAYROLL')
@Controller('shifts')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER, Role.STABLE_WORKER, Role.GROOM, Role.VET, Role.OTHER)
export class ShiftsController {
  constructor(private readonly service: StaffService) {}
  @Get('today') today(@Req() req: { user: AuthUser }) { return this.service.today(req.user); }
  @Post('start') start(@Body() dto: DutyDto, @Req() req: { user: AuthUser }) { return this.service.duty('start', dto.staffId, req.user); }
  @Post('end') end(@Body() dto: DutyDto, @Req() req: { user: AuthUser }) { return this.service.duty('end', dto.staffId, req.user); }
}
