import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { UpdateUserProfileDto } from '../users/dto/update-user-profile.dto';
import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
  Res, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Trainer } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SanitizeTrainerFields } from '../common/decorators/sanitize-trainer-fields.decorator';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { SanitizeRbacInterceptor } from '../common/interceptors/sanitize-rbac.interceptor';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { TrainersService } from './trainers.service';
import { ModuleAccessGuard, RequireModule, RequireModuleForFields } from '../auth/module-access.guard';

@ApiTags('Trainers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@RequireModuleForFields('STAFF_PAYROLL', ['baseRate'])
@UseInterceptors(SanitizeRbacInterceptor)
@SanitizeTrainerFields('baseRate')
@Controller('trainers')
export class TrainersController {
  constructor(private readonly trainersService: TrainersService, private readonly identity: VkIdentityService) {}
  @Patch(':id/vk')
  @RequireModule('SCHEDULE')
  @Roles(Role.ADMIN, Role.MANAGER)
  setVk(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserProfileDto) { return this.identity.setTrainer(id, dto.vkId); }


  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) res: Response): Promise<Trainer[]> {
    const { data, total } = await this.trainersService.findAll(query);
    setRefineTotalHeaders(res, total);
    return data;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Trainer> {
    return this.trainersService.findOne(id);
  }

  @Post()
  @RequireModule('SCHEDULE')
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateTrainerDto): Promise<Trainer> {
    return this.trainersService.create(dto);
  }

  @Patch(':id')
  @RequireModule('SCHEDULE')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateTrainerDto): Promise<Trainer> {
    return this.trainersService.update(id, dto);
  }

  @Delete(':id')
  @RequireModule('SCHEDULE')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<Trainer> {
    return this.trainersService.remove(id);
  }
}
