import { ConflictException } from '@nestjs/common';

export type BookingFailureCode =
  | 'HORSE_NOT_ACTIVE' | 'RIDER_WEIGHT_REQUIRED' | 'BOOKING_NOT_UPCOMING' | 'HORSE_UNAVAILABLE' | 'RIDER_WEIGHT_EXCEEDED' | 'HORSE_OVERLOADED'
  | 'HORSE_REST_VIOLATION' | 'TRAINER_BUSY' | 'ARENA_FULL'
  | 'TRAINER_UNAVAILABLE' | 'ARENA_UNAVAILABLE' | 'RESOURCE_NOT_FOUND'
  | 'MEMBERSHIP_INVALID' | 'BOOKING_CONTENTION' | 'BOOKING_NOT_EDITABLE'
  | 'MEMBERSHIP_REQUIRED' | 'MEMBERSHIP_UNAVAILABLE' | 'MEMBERSHIP_INSUFFICIENT' | 'BOOKING_STATE_CONFLICT';

export class BookingValidationError extends ConflictException {
  constructor(readonly code: BookingFailureCode, message: string, details: Record<string, unknown> = {}) {
    super({ statusCode: 409, error: 'BookingValidationError', code, message, details });
  }
}
