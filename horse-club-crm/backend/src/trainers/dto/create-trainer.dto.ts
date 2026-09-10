import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTrainerDto {
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
