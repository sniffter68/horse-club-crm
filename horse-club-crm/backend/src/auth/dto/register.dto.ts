import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, MinLength } from 'class-validator';
import { LoginDto } from './login.dto';
import { PreserveInput } from '../decorators/preserve-input.decorator';

export class RegisterDto extends LoginDto {
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 72, writeOnly: true })
  @MinLength(12)
  declare password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  @PreserveInput()
  role!: Role;
}
