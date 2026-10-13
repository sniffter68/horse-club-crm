import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { catchError, throwError } from 'rxjs';

// Multer 2 uses error messages that older Nest adapters may not recognize.
// Map stable error codes so invalid multipart input never becomes HTTP 500.
@Injectable()
export class MultipartErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(catchError((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
        if (error.code === 'LIMIT_FILE_SIZE') return throwError(() => new PayloadTooLargeException('Максимальный размер фото — 5 МБ'));
        if (error.code.startsWith('LIMIT_')) return throwError(() => new BadRequestException('Передайте одно изображение в поле file'));
      }
      return throwError(() => error);
    }));
  }
}
