import type { TrainerValues } from '../catalogs/types'
import { horseServiceSettings, type HorseServiceDirection } from '../horses/serviceAvailability'

export const trainerServiceSettings = horseServiceSettings
export type TrainerDirections = Pick<TrainerValues, HorseServiceDirection>

export function trainerServiceWarning(trainer: TrainerDirections | undefined, direction?: HorseServiceDirection): string | undefined {
  if (!trainer || !direction || trainer[direction] !== false) return undefined
  const title = trainerServiceSettings.find(setting => setting.key === direction)!.title
  return `Направление «${title}» не входит в специализацию тренера. Уточните назначение перед записью. Сохранение доступно.`
}
