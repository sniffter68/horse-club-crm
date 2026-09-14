import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateHorseHealthLogDto } from './dto/create-horse-health-log.dto';
import { UpdateHorseHealthLogDto } from './dto/update-horse-health-log.dto';
import { HorseHealthLogsService, type HorseHealthLogWithHorse } from './horse-health-logs.service';

@ApiTags('Horse health logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('horse-health-logs')
export class HorseHealthLogsController {
  constructor(private readonly service: HorseHealthLogsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) response: Response): Promise<HorseHealthLogWithHorse[]> {
    const { data, total } = await this.service.findAll(query);
    setRefineTotalHeaders(response, total);
    return data;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<HorseHealthLogWithHorse> {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateHorseHealthLogDto): Promise<HorseHealthLogWithHorse> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateHorseHealthLogDto,
  ): Promise<HorseHealthLogWithHorse> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<HorseHealthLogWithHorse> {
    return this.service.remove(id);
  }
}
