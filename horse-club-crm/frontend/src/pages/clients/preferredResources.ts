import type { Horse, Trainer } from '../catalogs/types'
import { isUuid } from '../../uuid'

export const activePreferredHorse = (horse: Horse) => (!horse.status || horse.status === 'active') && !horse.isUnavailable && (!horse.healthStatus || horse.healthStatus === 'HEALTHY')
export const activePreferredTrainer = (trainer: Trainer) => trainer.isActive !== false

// An automatic value follows the client until the administrator overrides it.
export function preferredValue(current: string | undefined, previous: string | undefined, manual: boolean, preferred: string | null | undefined, eligible: boolean) {
  if (manual || (current && current !== previous)) return current
  return preferred && isUuid(preferred) && eligible ? preferred : undefined
}
