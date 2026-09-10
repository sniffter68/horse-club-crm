import { Transform } from 'class-transformer';

// Validate the original credential type even with global implicit conversion enabled.
export function PreserveInput(): PropertyDecorator {
  return Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => obj[key],
    { toClassOnly: true },
  );
}
