import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AcceptLeadDto } from './accept-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('Lead management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('leads')
export class LeadManagementController {
  constructor(private readonly leads: LeadsService) {}

  @Patch(':id/accept')
  accept(@Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ expectedType: AcceptLeadDto, whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } })) dto: unknown) {
    return this.leads.accept(id, dto as AcceptLeadDto);
  }

  @Patch(':id/reject')
  reject(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leads.reject(id);
  }
}
