import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';
import { UPLOAD_DIRECTORY, uploadsDirectory, UploadStorage } from './upload.storage';

@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [UploadStorage, { provide: UPLOAD_DIRECTORY, useValue: uploadsDirectory }],
})
export class UploadModule {}
