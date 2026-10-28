import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { FinancialPeriodFilter } from './financial-period.filter';
import { BigIntJsonInterceptor } from './interceptors/bigint-json.interceptor';
import { SanitizeRbacInterceptor } from './interceptors/sanitize-rbac.interceptor';

@Global()
@Module({
  providers: [{ provide: APP_FILTER, useClass: FinancialPeriodFilter }, SanitizeRbacInterceptor, { provide: APP_INTERCEPTOR, useExisting: SanitizeRbacInterceptor }, { provide: APP_INTERCEPTOR, useClass: BigIntJsonInterceptor }],
  exports: [SanitizeRbacInterceptor],
})
export class CommonModule {}
