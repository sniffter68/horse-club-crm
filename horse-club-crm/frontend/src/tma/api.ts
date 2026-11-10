export type LessonStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export interface TrainerLesson {
  id: string
  startTime: string
  endTime: string
  status: LessonStatus
  trainerName?: string
  serviceName: string
  clientName: string
  horseId: string | null
  horseName: string | null
  notes: string | null
  participants: { bookingId: string; clientName: string; horseId: string | null; horseName: string | null }[]
}
export interface TrainerSession {
  role?: 'ADMIN' | 'TRAINER'
  authenticated: true
  access_token: string
  trainer: { trainerId: string; name: string }
  accessLevel: 'FULL' | 'READ_ONLY'
}
export type TrainerAuthResponse = TrainerSession | { authenticated: false; reason: 'NOT_LINKED' }
export interface TmaHorse { id: string; name: string }

export class TmaApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function tmaRequest<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/tma/${path}`, { ...options, credentials: 'omit', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!response.ok) {
    let body: unknown
    try { body = await response.json() } catch { /* Proxy failures can return HTML. */ }
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined
    throw new TmaApiError(typeof message === 'string' ? message : Array.isArray(message) && message.every(item => typeof item === 'string')
      ? message.join('. ') : 'Не удалось выполнить запрос. Проверьте соединение и повторите', response.status)
  }
  return response.json() as Promise<T>
}

export type TmaBootstrapResponse =
  | { role: 'CLIENT'; token: null; user: { telegramId: string; firstName: string }; clientId: string | null; clientName: string | null }
  | { role: 'TRAINER' | 'ADMIN'; token: string; trainerId: string | null; user: { id: string; name: string }; accessLevel: 'FULL' | 'READ_ONLY' }
