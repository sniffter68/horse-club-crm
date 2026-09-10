const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
require('reflect-metadata');

// Unit-test database boundary only; no generated production schema is available.
const Role = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', TRAINER: 'TRAINER' };
class PrismaError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === '@prisma/client') return {
    Role, PrismaClient: class {}, Prisma: { PrismaClientKnownRequestError: PrismaError },
  };
  return originalLoad.call(this, id, ...args);
};
const { AuthService } = require('../dist/auth/auth.service');
const { AuthController } = require('../dist/auth/auth.controller');
const { LoginDto } = require('../dist/auth/dto/login.dto');
const { RegisterDto } = require('../dist/auth/dto/register.dto');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/auth/guards/roles.guard');
const { Roles } = require('../dist/auth/decorators/roles.decorator');
const { createAuthOptions } = require('../dist/auth/auth.config');
Module._load = originalLoad;

const { ValidationPipe } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const bcrypt = require('bcrypt');
const secret = 'test-only-secret-abcdefghijklmnopqrstuvwxyz0123456789';
const jwt = new JwtService({ secret, signOptions: { algorithm: 'HS256', expiresIn: '7d' } });
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
  transform: true, transformOptions: { enableImplicitConversion: true } });
const validate = (value, metatype) => pipe.transform(value, { type: 'body', metatype });
const status = (expected) => (error) => error.getStatus() === expected;

test('DTO rejects extra fields, invalid roles and numeric credentials', async () => {
  const login = { email: 'admin@example.com', password: 'long-password-123' };
  await validate(login, LoginDto);
  await validate({ ...login, role: Role.ADMIN }, RegisterDto);
  await assert.rejects(validate({ ...login, extra: true }, LoginDto), status(400));
  await assert.rejects(validate({ ...login, password: 123456789012 }, LoginDto), status(400));
  await assert.rejects(validate({ ...login, role: 'OWNER' }, RegisterDto), status(400));
  await assert.rejects(validate({ ...login, password: 'short', role: Role.ADMIN }, RegisterDto), status(400));
});

test('login verifies bcrypt, signs seven-day claims and does not expose the hash', async () => {
  const password = 'test-password-123';
  const user = { id: 'user-1', email: 'admin@example.com', role: Role.ADMIN,
    passwordHash: await bcrypt.hash(password, 12) };
  const service = new AuthService({ user: { findUnique: async () => user } }, jwt);
  await service.onModuleInit();
  const response = await service.login({ email: user.email, password });
  assert.deepEqual(response.user, { id: user.id, email: user.email, role: user.role });
  assert.equal(response.user.passwordHash, undefined);
  const payload = jwt.verify(response.access_token);
  assert.equal(payload.sub, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
  assert.equal(payload.passwordHash, undefined);
  await assert.rejects(service.validateUser(user.email, 'wrong'), status(401));
  const missing = new AuthService({ user: { findUnique: async () => null } }, jwt);
  await missing.onModuleInit();
  await assert.rejects(missing.validateUser(user.email, password), status(401));
});

test('registration hashes passwords, rejects bcrypt truncation and maps duplicate users to 409', async () => {
  let saved;
  const service = new AuthService({ user: { create: async ({ data }) => {
    saved = data;
    return { id: 'new-user', email: data.email, role: data.role };
  } } }, jwt);
  const dto = { email: 'trainer@example.com', password: 'secure-password-123', role: Role.TRAINER };
  const result = await service.register(dto);
  assert.equal(await bcrypt.compare(dto.password, saved.passwordHash), true);
  assert.equal(bcrypt.getRounds(saved.passwordHash), 12);
  assert.equal(result.passwordHash, undefined);
  await assert.rejects(service.register({ ...dto, password: 'я'.repeat(37) }), status(400));
  const duplicate = new AuthService({ user: { create: async () => { throw new PrismaError('P2002'); } } }, jwt);
  await assert.rejects(duplicate.register(dto), status(409));
});

function authenticate(token) {
  return new Promise((resolve, reject) => {
    const strategy = new JwtStrategy({ secret });
    strategy.success = resolve;
    strategy.fail = () => reject(new Error('Unauthorized'));
    strategy.error = reject;
    strategy.authenticate({ headers: { authorization: `Bearer ${token}` } });
  });
}

test('JWT strategy rejects expired, forged and malformed tokens', async () => {
  const claims = { sub: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
  assert.deepEqual(await authenticate(jwt.sign(claims)), { id: claims.sub, email: claims.email, role: claims.role });
  await assert.rejects(authenticate(jwt.sign(claims, { expiresIn: -1 })));
  await assert.rejects(authenticate(jwt.sign(claims, { secret: 'another-secret' })));
  await assert.rejects(authenticate(jwt.sign({ ...claims, role: 'OWNER' })));
  await assert.rejects(authenticate(jwt.sign(claims, { algorithm: 'HS384' })));
});

test('roles deny missing users and wrong roles; method metadata overrides class metadata', () => {
  class Controller {}
  function handler() {}
  Roles(Role.MANAGER)(Controller);
  Reflect.defineMetadata('auth:roles', [Role.ADMIN], handler);
  const guard = new RolesGuard(new Reflector());
  const context = (user) => ({ getHandler: () => handler, getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }) });
  assert.equal(guard.canActivate(context()), false);
  assert.equal(guard.canActivate(context({ role: Role.TRAINER })), false);
  assert.equal(guard.canActivate(context({ role: Role.MANAGER })), false);
  assert.equal(guard.canActivate(context({ role: Role.ADMIN })), true);
  assert.deepEqual(Reflect.getMetadata('auth:roles', AuthController.prototype.register), [Role.ADMIN]);
  assert.deepEqual(Reflect.getMetadata('__guards__', AuthController.prototype.register), [JwtAuthGuard, RolesGuard]);
});

test('JWT configuration fails closed without a sufficiently long secret', () => {
  const previous = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(createAuthOptions);
    process.env.JWT_SECRET = 'short';
    assert.throws(createAuthOptions);
    process.env.JWT_SECRET = secret;
    assert.deepEqual(createAuthOptions(), { secret });
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
