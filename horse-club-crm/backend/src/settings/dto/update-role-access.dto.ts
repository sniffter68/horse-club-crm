import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import type { RolePermissions } from '../../auth/role-access';

export class UpdateRoleAccessDto implements RolePermissions {
  // Keep the original JSON value: implicit conversion must not turn "false" into true.
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() horseReplaceOwn!: boolean;
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() horseReplaceAny!: boolean;
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() healthRead!: boolean;
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() healthWrite!: boolean;
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() financeRead!: boolean;
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() boardingAccess!: boolean;
}
