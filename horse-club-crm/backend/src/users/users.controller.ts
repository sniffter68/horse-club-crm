import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { UpdateUserVkDto } from './dto/update-user-vk.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { setRefineTotalHeaders } from '../common/refine';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService, type PublicUser } from './users.service';
import { UpdateUserTrainerDto } from './dto/update-user-trainer.dto';

@RequireModule('STAFF_PAYROLL')
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly identity: VkIdentityService) {}
  @Patch(':id')
  setProfile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserProfileDto) { return this.identity.setStaff(id, dto.vkId); }
  @Patch(':id/trainer')
  setTrainer(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserTrainerDto) { return this.usersService.setTrainer(id, dto.trainerId); }
  @Patch(':id/vk')
  setVk(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserVkDto): Promise<PublicUser> {
    return this.usersService.setVkRecipient(id, dto.vkUserId);
  }
  @Get()
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) res: Response): Promise<PublicUser[]> {
    const { data, total } = await this.usersService.findAll(query); setRefineTotalHeaders(res, total); return data;
  }
  @Post()
  create(@Body() dto: CreateUserDto): Promise<PublicUser> { return this.usersService.create(dto); }
}
