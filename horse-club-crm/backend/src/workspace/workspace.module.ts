import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CashboxService } from '../cashbox/cashbox.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

@Module({ imports: [AuthModule], controllers: [WorkspaceController], providers: [WorkspaceService, CashboxService], exports: [WorkspaceService] })
export class WorkspaceModule {}
