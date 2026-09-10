import type { User } from '@prisma/client';

export type AuthUser = Pick<User, 'id' | 'email' | 'role'>;

export interface JwtPayload {
  sub: User['id'];
  email: User['email'];
  role: User['role'];
}

export interface AuthRequest {
  user?: AuthUser;
}

export interface AccessTokenResponse {
  access_token: string;
  user: AuthUser;
}
