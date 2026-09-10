export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = '7' + digits.slice(1)
  if (!digits.startsWith('7') && digits) digits = '7' + digits
  return digits.slice(0, 11)
}
export function phoneMask(value: string): string {
  const digits = phoneDigits(value)
  if (!digits) return ''
  const rest = digits.slice(1)
  return '+7' + (rest ? ' (' + rest.slice(0, 3) : '') + (rest.length >= 3 ? ')' : '')
    + (rest.length > 3 ? ' ' + rest.slice(3, 6) : '') + (rest.length > 6 ? '-' + rest.slice(6, 8) : '') + (rest.length > 8 ? '-' + rest.slice(8, 10) : '')
}
export interface LeadPayload { firstName: string; phone: string; email?: string; serviceId?: string; preferences?: string }
export async function sendLead(payload: LeadPayload): Promise<void> {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
  let response: Response
  try {
    response = await fetch(`${base}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) })
  } catch { throw new Error('Не удалось связаться с клубом. Проверьте интернет и попробуйте ещё раз. Если заявка уже отправилась, повтор не создаст второго клиента.') }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'message' in body ? body.message : undefined
    if (response.status === 400 && typeof detail === 'string') throw new Error(detail)
    if (response.status === 400 && Array.isArray(detail) && detail.every(item => typeof item === 'string')) throw new Error(detail.join('. '))
    if (response.status === 429) throw new Error('Слишком много попыток. Подождите немного и отправьте заявку снова.')
    throw new Error('Сейчас не удалось принять заявку. Попробуйте чуть позже — введённые данные сохранены в форме.')
  }
  if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true) throw new Error('Сервер не подтвердил заявку. Попробуйте ещё раз.')
}
