import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthRequest, AuthUser } from '../auth.types';

export const CurrentUser = createParamDecorator<undefined, AuthUser>(
  (_data: undefined, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
