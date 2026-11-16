import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';
import { RefineQueryDto } from '../../common/dto/refine-query.dto';
export class StallQueryDto extends RefineQueryDto {
 @Transform(({ value }) => value === '' ? undefined : value) @IsOptional() @IsUUID() buildingId?: string;
}
