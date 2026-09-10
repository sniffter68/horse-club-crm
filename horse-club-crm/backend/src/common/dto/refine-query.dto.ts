import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RefineQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  _start = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  _end = 10;

  @IsOptional()
  @IsString()
  _sort?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  _order: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @IsString()
  q?: string;
}
