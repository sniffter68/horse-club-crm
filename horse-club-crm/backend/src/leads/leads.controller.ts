import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { CreateLeadDto } from './create-lead.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}
  @Post()
  create(@Body(new ValidationPipe({ expectedType: CreateLeadDto, whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } })) dto: unknown) {
    return this.leads.create(dto as CreateLeadDto);
  }
}
