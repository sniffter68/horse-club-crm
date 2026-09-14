import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, type PricingPlan } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreatePricingPlanDto } from './dto/create-pricing-plan.dto';
import { UpdatePricingPlanDto } from './dto/update-pricing-plan.dto';
import { PricingPlansService } from './pricing-plans.service';

@ApiTags('Pricing plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('pricing-plans')
export class PricingPlansController {
  constructor(private readonly service: PricingPlansService) {}

  @Get()
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) res: Response): Promise<PricingPlan[]> {
    const { data, total } = await this.service.findAll(query);
    setRefineTotalHeaders(res, total);
    return data;
  }
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<PricingPlan> { return this.service.findOne(id); }
  @Post()
  create(@Body() dto: CreatePricingPlanDto): Promise<PricingPlan> { return this.service.create(dto); }
  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePricingPlanDto): Promise<PricingPlan> { return this.service.update(id, dto); }
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<PricingPlan> { return this.service.remove(id); }
}
