import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BoardingContractStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateBoardingContractDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null — клубное размещение без начислений' })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  horseId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  stallId?: string | null;

  @ApiPropertyOptional({ enum: BoardingContractStatus, default: BoardingContractStatus.DRAFT })
  @IsOptional()
  @IsEnum(BoardingContractStatus)
  status?: BoardingContractStatus;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999999999.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  monthlyRate?: number;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
