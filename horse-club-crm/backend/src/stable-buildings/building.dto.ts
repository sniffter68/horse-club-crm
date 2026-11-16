import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
export class CreateBuildingDto {
 @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(150) name!: string;
 @Type(() => Number) @ValidateIf((_o, v) => v !== undefined) @IsInt() @Min(1) @Max(100) gridRows?: number;
 @Type(() => Number) @ValidateIf((_o, v) => v !== undefined) @IsInt() @Min(1) @Max(100) gridCols?: number;
 @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @ValidateIf((_o, v) => v !== undefined) aisleCols?: number[];
 @Type(() => Number) @ValidateIf((_o, v) => v !== undefined) @IsInt() order?: number;
}
export class UpdateBuildingDto extends PartialType(CreateBuildingDto, { skipNullProperties: false }) {}
