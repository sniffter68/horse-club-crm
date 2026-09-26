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
    const extraFields = this.reflector.getAllAndOverride<string[]>(TRAINER_HIDDEN_FIELDS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.user?.role !== Role.TRAINER) {
      return next.handle();
    }
    const fields = [...new Set(['medicalNotes', 'preferences', 'email', 'phone', 'vkUserId',
      'baseRate', 'price', 'monthlyRate', 'payments', 'membership', 'memberships',
      'membershipId', 'operations', 'passwordHash', ...(extraFields ?? [])])];
    return next.handle().pipe(map((value: unknown) => this.sanitize(value, fields)));
  }

  private sanitize(value: unknown, fields: readonly string[]): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item, fields));
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
    const result: JsonObject = Object.fromEntries(Object.entries(value as JsonObject)
      .filter(([key]) => !fields.includes(key))
      .map(([key, item]) => [key, this.sanitize(item, fields)]));
    // Preserve collection shape for existing read-only screens without exposing records.
    for (const key of ['payments', 'memberships', 'operations']) {
      if (Array.isArray((value as JsonObject)[key])) result[key] = [];
    }
    return result;
  }
}
