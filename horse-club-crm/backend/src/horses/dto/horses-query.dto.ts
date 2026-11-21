import { IsIn, IsOptional } from 'class-validator';
import { RefineQueryDto } from '../../common/dto/refine-query.dto';

export class HorsesQueryDto extends RefineQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: string;
}
