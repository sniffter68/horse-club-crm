import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IMAGE_TYPES, MAX_IMAGE_SIZE, UploadStorage } from './upload.storage';
import type { UploadedImage } from './upload.storage';
import { MultipartErrorsInterceptor } from './multipart-errors.interceptor';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly storage: UploadStorage) {}

  @Post('image')
  @UseInterceptors(MultipartErrorsInterceptor, FileInterceptor('file', {
    limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 0 },
    fileFilter: (_request, file, callback) => {
      if (!Object.hasOwn(IMAGE_TYPES, file.mimetype)) {
        callback(new BadRequestException('Допустимы только изображения JPG, PNG и WebP'), false);
      } else callback(null, true);
    },
  }))
  upload(@UploadedFile() file?: UploadedImage): Promise<{ url: string }> {
    return this.storage.save(file);
  }
}
