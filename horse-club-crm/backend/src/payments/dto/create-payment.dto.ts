import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreatePaymentDto {
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID() requestId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  bookingId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  boardingContractId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  membershipId?: string | null;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 9999999999.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount?: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  paidAt?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
