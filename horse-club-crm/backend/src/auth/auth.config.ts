export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');
export const BCRYPT_ROUNDS = 12;

export interface AuthOptions {
  secret: string;
}

export function createAuthOptions(): AuthOptions {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random secret data.');
  }
  return { secret };
}
