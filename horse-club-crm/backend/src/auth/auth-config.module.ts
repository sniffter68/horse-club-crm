import { Module } from '@nestjs/common';
import { AUTH_OPTIONS, createAuthOptions } from './auth.config';

@Module({
  providers: [{ provide: AUTH_OPTIONS, useFactory: createAuthOptions }],
  exports: [AUTH_OPTIONS],
})
export class AuthConfigModule {}
