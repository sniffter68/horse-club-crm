import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../auth/module-access.guard';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ArchiveQueryDto } from '../common/dto/archive-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipMemberDto } from './dto/membership-member.dto';
import { MembershipsService, type MembershipResponse } from './memberships.service';

@RequireModule('SCHEDULE')
@ApiTags('Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@Controller(['memberships', 'client-memberships'])
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}
  @Get()
  async findAll(@Query() query: ArchiveQueryDto, @Res({ passthrough: true }) res: Response): Promise<MembershipResponse[]> {
    const { data, total } = await this.membershipsService.findAll(query); setRefineTotalHeaders(res, total); return data;
  }
  @Post()
  create(@Body() dto: CreateMembershipDto, @CurrentUser() actor: AuthUser): Promise<MembershipResponse> { return this.membershipsService.create(dto, actor); }
  @Get('pricing-plans')
  async findPricingPlans(@Res({ passthrough: true }) res: Response) {
    const plans = await this.membershipsService.findPricingPlans();
    setRefineTotalHeaders(res, plans.length);
    return plans;
  }
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.membershipsService.remove(id); }
  @Post(':id/members')
  addMember(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: MembershipMemberDto, @CurrentUser() actor: AuthUser) {
    return this.membershipsService.addMember(id, dto.clientId, actor);
  }
  @Delete(':id/members/:clientId')
  removeMember(@Param('id', new ParseUUIDPipe()) id: string, @Param('clientId', new ParseUUIDPipe()) clientId: string) {
    return this.membershipsService.removeMember(id, clientId);
  }
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) { return this.membershipsService.findOne(id); }
}
