export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits || !/^[78]/.test(digits) && digits.length !== 10) return value
  const local = (value.startsWith('+7') || digits[0] === '8' || digits.length !== 10 ? digits.slice(1) : digits).slice(0, 10)
  return '+7' + (local ? ` (${local.slice(0, 3)}` : '') + (local.length >= 3 ? ')' : '')
    + (local.length > 3 ? ` ${local.slice(3, 6)}` : '') + (local.length > 6 ? `-${local.slice(6, 8)}` : '')
    + (local.length > 8 ? `-${local.slice(8, 10)}` : '')
}

export function phonePayload(value?: string | null) {
  if (!value?.trim()) return null
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && digits[0] === '8' ? `+7${digits.slice(1)}`
    : digits.length === 10 && !value.startsWith('+') ? `+7${digits}` : `+${digits}`
}

