import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_OPTIONS } from '../auth.config';
import type { AuthOptions } from '../auth.config';
import type { AuthUser, JwtPayload } from '../auth.types';

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    ((typeof payload.sub === 'string' && payload.sub.length > 0) ||
      (typeof payload.sub === 'number' && Number.isSafeInteger(payload.sub))) &&
    typeof payload.email === 'string' && payload.email.length > 0 &&
    (payload.role === Role.ADMIN || payload.role === Role.MANAGER || payload.role === Role.TRAINER) &&
    typeof payload.exp === 'number' && Number.isFinite(payload.exp)
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(AUTH_OPTIONS) options: AuthOptions) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: options.secret,
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  validate(payload: unknown): AuthUser {
    if (!isJwtPayload(payload)) throw new UnauthorizedException('Invalid token payload');
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
