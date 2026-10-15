// Matches the backend's @IsUUID() (validator "all"), including nil/max UUIDs.
const uuid = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i

export function isHorseUuid(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value)
}

export function canRequestStableList(params: URLSearchParams, horseIdRequired = false): boolean {
  if (!horseIdRequired && !params.has('horseId')) return true
  return isHorseUuid(params.get('horseId'))
}
