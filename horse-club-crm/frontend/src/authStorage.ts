export type Role = 'ADMIN' | 'MANAGER' | 'TRAINER'
export interface Identity { email: string; role: Role }
const keys = { token: 'horsecrm.access_token', role: 'horsecrm.role', email: 'horsecrm.email' }
export function isRole(value: unknown): value is Role {
  return value === 'ADMIN' || value === 'MANAGER' || value === 'TRAINER'
}
export function getToken(): string | null {
  return localStorage.getItem(keys.token)
}
export function getIdentity(): Identity | null {
  const role = localStorage.getItem(keys.role)
  const email = localStorage.getItem(keys.email)
  return getToken() && email && isRole(role) ? { email, role } : null
}
export function clearSession(): void {
  Object.values(keys).forEach((key) => localStorage.removeItem(key))
}
export function saveSession(token: string, identity: Identity): void {
  try {
    localStorage.setItem(keys.email, identity.email)
    localStorage.setItem(keys.role, identity.role)
    localStorage.setItem(keys.token, token)
  } catch (error) {
    clearSession()
    throw error
  }
}
