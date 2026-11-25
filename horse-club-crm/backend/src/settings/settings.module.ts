import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OperationalResetController } from './operational-reset.controller';
import { OperationalResetService } from './operational-reset.service';
import { NotificationDigestService } from './notification-digest.service';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController, OperationalResetController],
  providers: [SettingsService, OperationalResetService, NotificationDigestService],
  exports: [SettingsService],
})
export class SettingsModule {}
