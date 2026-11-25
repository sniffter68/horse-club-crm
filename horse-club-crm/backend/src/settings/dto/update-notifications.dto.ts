import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, ValidateIf, IsUUID, Matches } from 'class-validator';

export class UpdateNotificationsDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean() clientReminder24h?: boolean;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean() clientReminder2h?: boolean;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean() trainerNewBooking?: boolean;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean() trainerCancellation?: boolean;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean() adminDigest?: boolean;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) adminDigestTime?: string;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @IsArray() @ArrayUnique() @ArrayMaxSize(50) @IsUUID('4', { each: true }) adminRecipientIds?: string[];
}
