import { SetMetadata } from '@nestjs/common';

export const TRAINER_HIDDEN_FIELDS = 'rbac:trainer-hidden-fields';

export const SanitizeTrainerFields = (...fields: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(TRAINER_HIDDEN_FIELDS, fields);
