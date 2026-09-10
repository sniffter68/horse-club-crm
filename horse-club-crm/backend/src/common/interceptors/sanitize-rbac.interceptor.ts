import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AuthRequest } from '../../auth/auth.types';
import { TRAINER_HIDDEN_FIELDS } from '../decorators/sanitize-trainer-fields.decorator';

type JsonObject = Record<string, unknown>;

@Injectable()
export class SanitizeRbacInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const fields = this.reflector.getAllAndOverride<string[]>(TRAINER_HIDDEN_FIELDS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.user?.role !== Role.TRAINER || !fields?.length) {
      return next.handle();
    }
    return next.handle().pipe(map((value: unknown) => this.sanitize(value, fields)));
  }

  private sanitize(value: unknown, fields: readonly string[]): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item, fields));
    if (value === null || typeof value !== 'object' || value instanceof Date) return value;
    const sanitized: JsonObject = { ...(value as JsonObject) };
    for (const field of fields) delete sanitized[field];
    return sanitized;
  }
}
