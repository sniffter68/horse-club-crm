// Shared by CORS and mutation/CSRF validation. Never use a wildcard with cookies.
export const trustedOrigins = [
  'https://crm.horseclub68.ru',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
];

export const isTrustedOrigin = (origin: string): boolean => trustedOrigins.includes(origin);

export const corsOptions = {
  origin: trustedOrigins,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'Content-Disposition', 'Retry-After'],
};
