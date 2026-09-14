import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, type Stall } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { StallsService } from './stalls.service';

@ApiTags('Stalls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stalls')
export class StallsController {
  constructor(private readonly service: StallsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) response: Response): Promise<Stall[]> {
    const { data, total } = await this.service.findAll(query);
    setRefineTotalHeaders(response, total);
    return data;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Stall> {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateStallDto): Promise<Stall> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStallDto): Promise<Stall> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<Stall> {
    return this.service.remove(id);
  }
}
