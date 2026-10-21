import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { RefineQueryDto } from './refine-query.dto';

export class ArchiveQueryDto extends RefineQueryDto {
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsOptional()
  @IsBoolean()
  archivedOnly?: boolean;
}
