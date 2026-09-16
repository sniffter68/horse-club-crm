import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsController } from './leads.controller';
import { LeadManagementController } from './lead-management.controller';
import { LeadsService } from './leads.service';
@Module({ imports: [PrismaModule, AuthModule], controllers: [LeadsController, LeadManagementController], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
