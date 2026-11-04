import { Transform } from 'class-transformer';
import { PublicationDto } from '../../common/dto/publication.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, Matches, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateTrainerDto extends PublicationDto {
  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  vkId?: string | null;

  @ApiPropertyOptional({ default: 4, description: 'Максимум одновременных всадников' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  maxParallelLessons?: number;

  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) scheduleColor?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  qualification?: string;

  @ApiPropertyOptional({ default: 480, description: 'Максимальная дневная нагрузка в минутах' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  maxDailyLoad?: number;
  @ApiProperty({ example: 'Иван Соколов' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '+79991234567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseRate!: number;
}
