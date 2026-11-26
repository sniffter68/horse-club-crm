import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateStallRiskDto {
  @IsOptional()
  @IsBoolean()
  stallRiskAdjacent?: boolean;

  @IsOptional()
  @IsBoolean()
  stallRiskOpposite?: boolean;
}
