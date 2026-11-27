// Shared by CORS and mutation/CSRF validation. Never use a wildcard with cookies.
export const trustedOrigins = [
  'https://horseclub68.ru',
  'https://vk.com',
  'https://m.vk.com',
  'https://crm.horseclub68.ru',
  'https://demo.horseclub68.ru',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
];

export const isTrustedOrigin = (origin: string): boolean => trustedOrigins.includes(origin) || (() => {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'https:' && !url.port &&
      (url.hostname.endsWith('.vk.com') || url.hostname.endsWith('.vk-apps.com'));
  } catch { return false; }
})();

export const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => callback(null, !origin || isTrustedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'Content-Disposition', 'Retry-After'],
};