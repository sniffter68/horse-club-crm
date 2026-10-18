import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { AccessLevel, Role, SystemModule } from '@prisma/client';

export class ToggleModuleDto {
  @IsEnum(SystemModule) module!: SystemModule;
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() isEnabled!: boolean;
}
export class ModulePermissionDto {
  @IsEnum(Role) role!: Role;
  @IsEnum(SystemModule) module!: SystemModule;
  @IsEnum(AccessLevel) accessLevel!: AccessLevel;
}
export class UpdateModulePermissionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => ModulePermissionDto)
  permissions!: ModulePermissionDto[];
}
