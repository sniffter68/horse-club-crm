import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { RefineQueryDto } from '../../common/dto/refine-query.dto';

export class PaymentQueryDto extends RefineQueryDto {
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsIn(['MAIN', 'BOARDING'])
  cashboxType?: 'MAIN' | 'BOARDING';
}
