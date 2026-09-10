import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipsService, type MembershipResponse } from './memberships.service';

@ApiTags('Memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}
  @Get()
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) res: Response): Promise<MembershipResponse[]> {
    const { data, total } = await this.membershipsService.findAll(query); setRefineTotalHeaders(res, total); return data;
  }
  @Post()
  create(@Body() dto: CreateMembershipDto): Promise<MembershipResponse> { return this.membershipsService.create(dto); }
  @Get('pricing-plans')
  async findPricingPlans(@Res({ passthrough: true }) res: Response) {
    const plans = await this.membershipsService.findPricingPlans();
    setRefineTotalHeaders(res, plans.length);
    return plans;
  }
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) { return this.membershipsService.findOne(id); }
}
