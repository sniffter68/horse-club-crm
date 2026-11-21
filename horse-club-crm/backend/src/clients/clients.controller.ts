import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { BookingMembershipsQueryDto } from './dto/booking-memberships-query.dto';
import { ClientQueryDto } from './dto/client-query.dto';
import { QuickCreateClientDto } from './dto/quick-create-client.dto';
import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
  Res, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleAccessGuard, RequireModule } from '../auth/module-access.guard';
import { Role } from '@prisma/client';
import type { Client } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SanitizeTrainerFields } from '../common/decorators/sanitize-trainer-fields.decorator';
import { RefineQueryDto } from '../common/dto/refine-query.dto';
import { SanitizeRbacInterceptor } from '../common/interceptors/sanitize-rbac.interceptor';
import { setRefineTotalHeaders } from '../common/refine';
import { ClientsService, type ClientDetailsResponse, type ClientListResponse } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@RequireModule('SCHEDULE')
@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard, RolesGuard)
@UseInterceptors(SanitizeRbacInterceptor)
@SanitizeTrainerFields('medicalNotes')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async findAll(@Query() query: ClientQueryDto, @Res({ passthrough: true }) res: Response): Promise<ClientListResponse[]> {
    const { data, total } = await this.clientsService.findAll(query);
    setRefineTotalHeaders(res, total);
    return data;
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ClientDetailsResponse> {
    return this.clientsService.findOne(id);
  }

  @Get(':id/booking-memberships')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  bookingMemberships(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: BookingMembershipsQueryDto) {
    return this.clientsService.bookingMemberships(id, query);
  }

  @Get(':id/membership-ledger')
  @Roles(Role.ADMIN, Role.MANAGER)
  async findLedger(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: RefineQueryDto,
    @Res({ passthrough: true }) res: Response) {
    const { data, total } = await this.clientsService.findLedger(id, query);
    setRefineTotalHeaders(res, total);
    return data;
  }

  @Post('quick')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TRAINER)
  async quickCreate(@Body() dto: QuickCreateClientDto, @CurrentUser() actor: AuthUser) {
    const client = await this.clientsService.quickCreate(dto);
    return actor.role === Role.TRAINER ? { id: client.id, name: client.name, clientType: client.clientType, riderLevel: client.riderLevel } : client;
  }

  @Patch(':id/convert-to-regular')
  @Roles(Role.ADMIN, Role.MANAGER)
  convertToRegular(@Param('id', new ParseUUIDPipe()) id: string): Promise<Client> {
    return this.clientsService.convertToRegular(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateClientDto): Promise<Client> {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateClientDto): Promise<Client> {
    return this.clientsService.update(id, dto);
  }

  @Post(':id/restore')
  @Roles(Role.ADMIN, Role.MANAGER)
  restore(@Param('id', new ParseUUIDPipe()) id: string): Promise<Client> {
    return this.clientsService.restore(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientsService.remove(id);
  }
}
