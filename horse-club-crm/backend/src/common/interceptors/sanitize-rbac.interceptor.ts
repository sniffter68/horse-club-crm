import { Injectable, Optional } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Observable } from 'rxjs';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type { AuthRequest } from '../../auth/auth.types';
import { TRAINER_HIDDEN_FIELDS } from '../decorators/sanitize-trainer-fields.decorator';
import { RoleAccessService } from '../../auth/role-access.service';
import { ModuleAccessService } from '../../settings/module-access.service';

type JsonObject = Record<string, unknown>;

@Injectable()
export class SanitizeRbacInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, @Optional() private readonly access?: RoleAccessService,
    @Optional() private readonly modules?: ModuleAccessService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!user || !this.modules) return this.interceptLegacy(context, next);
    return from(this.modules.forRole(user.role)).pipe(switchMap(permissions => {
      const visible = (module: string) => permissions.some(row => row.module === module && row.isEnabled && row.accessLevel !== 'HIDDEN');
      const hidden: string[] = [];
      if (!visible('VETERINARY')) hidden.push('healthLogs', 'vetEvents', 'vetRecords', 'healthStatus', 'quarantineUntil', 'lastShoeingAt', 'lastVaccinationAt', 'lastDewormingAt', 'lastVetCheckAt', 'lastDentistAt');
      if (!visible('STABLES')) hidden.push('boardingContracts', 'currentBoardingContract', 'stall');
      if (!visible('SCHEDULE')) hidden.push('bookings', 'lessons');
      if (!visible('CASHBOX')) hidden.push('payments', 'operations');
      if (!visible('STAFF_PAYROLL') || (user.role !== Role.ADMIN && user.role !== Role.MANAGER)) hidden.push('baseRate', 'shiftRate', 'lessonRate', 'groupLessonRate', 'lessonPercentage');
      return this.interceptLegacy(context, next).pipe(map(value => this.sanitize(value, hidden)));
    }));
  }

  private interceptLegacy(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const extraFields = this.reflector.getAllAndOverride<string[]>(TRAINER_HIDDEN_FIELDS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.user?.role !== Role.TRAINER && request.user?.role !== Role.STABLE_WORKER) {
      return next.handle();
    }
    const fields = [...new Set(['medicalNotes', 'preferences', 'birthDate', 'email', 'phone', 'vkUserId',
      'baseRate', 'price', 'monthlyRate', 'payments', 'membership', 'memberships',
      'membershipId', 'operations', 'passwordHash', ...(extraFields ?? [])])];
    if (!this.access) return next.handle().pipe(map((value: unknown) => this.sanitize(value, fields)));
    return from(this.access.permissions(request.user.role)).pipe(switchMap(permissions => {
      let hidden = fields;
      if (permissions.financeRead) hidden = hidden.filter(field => !['price', 'monthlyRate', 'payments', 'membership', 'memberships', 'membershipId', 'operations'].includes(field));
      if (!permissions.healthRead) hidden = [...hidden, 'healthLogs', 'vetEvents', 'vetRecords', 'healthStatus', 'quarantineUntil', 'lastShoeingAt', 'lastVaccinationAt', 'lastDewormingAt', 'lastVetCheckAt', 'lastDentistAt'];
      if (!permissions.boardingAccess) hidden = [...hidden, 'boardingContracts', 'currentBoardingContract'];
      return next.handle().pipe(map((value: unknown) => this.sanitize(value, hidden)));
    }));
  }

  private sanitize(value: unknown, fields: readonly string[]): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item, fields));
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
    const result: JsonObject = Object.fromEntries(Object.entries(value as JsonObject)
      .filter(([key]) => !fields.includes(key))
      .map(([key, item]) => [key, this.sanitize(item, fields)]));
    // Preserve collection shape for existing read-only screens without exposing records.
    for (const key of ['payments', 'memberships', 'operations', 'healthLogs', 'vetEvents', 'vetRecords', 'boardingContracts', 'bookings', 'lessons']) {
      if (fields.includes(key) && Array.isArray((value as JsonObject)[key])) result[key] = [];
    }
    if (fields.includes('currentBoardingContract') && 'currentBoardingContract' in value) result.currentBoardingContract = null;
    return result;
  }
}
