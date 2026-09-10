import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BigIntJsonInterceptor } from './interceptors/bigint-json.interceptor';
import { SanitizeRbacInterceptor } from './interceptors/sanitize-rbac.interceptor';

@Global()
@Module({
  providers: [SanitizeRbacInterceptor, { provide: APP_INTERCEPTOR, useClass: BigIntJsonInterceptor }],
  exports: [SanitizeRbacInterceptor],
})
export class CommonModule {}
