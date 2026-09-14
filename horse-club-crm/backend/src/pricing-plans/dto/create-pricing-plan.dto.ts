import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePricingPlanDto {
  @ApiProperty({ example: '8 занятий' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 8, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  totalLessons!: number;

  @ApiProperty({ example: 30, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validDays!: number;

  @ApiProperty({ example: 24000, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  price!: number;
}
