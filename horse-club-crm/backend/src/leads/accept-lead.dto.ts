import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsPhoneNumber, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class LeadLessonDto {
  @IsUUID()
  trainerId!: string;

  @IsUUID()
  horseId!: string;

  @IsOptional()
  @IsUUID()
  arenaId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  startTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMinutes?: number;
}

export class AcceptLeadDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LeadLessonDto)
  lesson?: LeadLessonDto;

  @IsString()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @MaxLength(75)
  firstName!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @MaxLength(74)
  lastName?: string;

  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/)
  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preferences?: string;

  @IsBoolean()
  isRider!: boolean;

  @IsBoolean()
  isPayer!: boolean;
}
