import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, type Arena } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { ArenasService } from './arenas.service';
import { CreateArenaDto } from './dto/create-arena.dto';
import { UpdateArenaDto } from './dto/update-arena.dto';

@ApiTags('Arenas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('arenas')
export class ArenasController {
  constructor(private readonly service: ArenasService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) response: Response): Promise<Arena[]> {
    const { data, total } = await this.service.findAll(query);
    setRefineTotalHeaders(response, total);
    return data;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Arena> { return this.service.findOne(id); }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateArenaDto): Promise<Arena> { return this.service.create(dto); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateArenaDto): Promise<Arena> { return this.service.update(id, dto); }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<Arena> { return this.service.remove(id); }
}
