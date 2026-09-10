import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
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

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get()
  async findAll(@Query() query: RefineQueryDto, @Res({ passthrough: true }) res: Response): Promise<PublicUser[]> {
    const { data, total } = await this.usersService.findAll(query); setRefineTotalHeaders(res, total); return data;
  }
  @Post()
  create(@Body() dto: CreateUserDto): Promise<PublicUser> { return this.usersService.create(dto); }
}
