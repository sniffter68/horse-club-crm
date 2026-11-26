/** API root shared by REST, authentication, uploads and event streams. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (!configured) return '/api'
  const base = configured.replace(/\/+$/, '')
  if (base.startsWith('/') && !base.startsWith('//')) return base
  const url = new URL(base)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an HTTP(S) API root without credentials, query or fragment')
  }
  return base
}

/** Uploads are served at the backend origin, outside its /api prefix. */
export function getMediaUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (/^https?:\/\//i.test(value)) return value
  if (!value.startsWith('/uploads/')) return undefined
  const base = getApiBaseUrl()
  return /^https?:\/\//i.test(base) ? new URL(value, base).href : value
}
