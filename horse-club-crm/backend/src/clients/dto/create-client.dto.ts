import { Transform } from 'class-transformer';
import { ClientType } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { cleanText } from './quick-create-client.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsBoolean, IsDateString, Matches, IsEmail, IsNumber, IsOptional, IsString, Max, Min, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  preferredTrainerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsUUID()
  preferredHorseId?: string | null;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) birthDate?: string | null;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  riderLevel?: string;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 999.99, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  weightKg?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(75)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(74)
  lastName?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRider?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPayer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preferences?: string;
  @Transform(cleanText)
  @ApiProperty({ example: 'Анна Петрова' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '+79991234567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: 'anna@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  medicalNotes?: string;
}
