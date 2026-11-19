import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PreserveInput } from '../../auth/decorators/preserve-input.decorator';

export class TrainerAccountDto {
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional() @IsEmail() @MaxLength(320)
  email?: string;

  @PreserveInput() @IsOptional() @IsString() @MinLength(12) @MaxLength(72)
  password?: string;
}
