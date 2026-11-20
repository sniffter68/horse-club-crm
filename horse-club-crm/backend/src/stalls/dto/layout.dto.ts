import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';
import { PickType } from '@nestjs/swagger';
import { UpdateStallDto } from './update-stall.dto';
export class LayoutBlockDto extends PickType(UpdateStallDto, ['name', 'number', 'type'] as const) {
 @IsUUID() id!: string;
 @IsUUID() buildingId!: string;
 @Type(() => Number) @IsInt() @Min(1) row!: number;
 @Type(() => Number) @IsInt() @Min(1) col!: number;
 @Type(() => Number) @IsInt() @Min(1) rowSpan!: number;
 @Type(() => Number) @IsInt() @Min(1) colSpan!: number;
}
