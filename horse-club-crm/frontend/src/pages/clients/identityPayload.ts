export type ClientIdentityValues = { firstName: string; lastName?: string; phone: string }

export function clientIdentityPayload(values: ClientIdentityValues) {
  const firstName = values.firstName.trim()
  const lastName = values.lastName?.trim() ?? ''
  return { firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' '), phone: values.phone.trim() }
}
