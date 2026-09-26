import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_OPTIONS } from '../auth.config';
import type { AuthOptions } from '../auth.config';
import type { AuthUser, JwtPayload } from '../auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { sessionCookie } from '../session-cookie';

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
  constructor(@Inject(AUTH_OPTIONS) options: AuthOptions, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([sessionCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      secretOrKey: options.secret,
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(payload: unknown): Promise<AuthUser> {
    if (!isJwtPayload(payload)) throw new UnauthorizedException('Invalid token payload');
    if (typeof payload.sub !== 'string' || !payload.authVersion) throw new UnauthorizedException('Session expired');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub },
      select: { id: true, email: true, role: true, updatedAt: true } });
    if (!user || user.updatedAt.toISOString() !== payload.authVersion || user.role !== payload.role) {
      throw new UnauthorizedException('Session revoked');
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
