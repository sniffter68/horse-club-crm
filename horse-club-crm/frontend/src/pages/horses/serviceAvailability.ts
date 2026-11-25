import type { HorseValues, Service } from '../catalogs/types'

export const horseServiceSettings = [
  { key: 'allowIndividual', title: 'Индивидуальные тренировки', description: 'Допуск к персональным занятиям с тренером' },
  { key: 'allowGroup', title: 'Групповые занятия', description: 'Участие в сменах и групповых тренировках' },
  { key: 'allowWalk', title: 'Прогулки и выезды', description: 'Полевые выезды и конные прогулки' },
  { key: 'allowSpecial', title: 'Иппотерапия и фотосессии', description: 'Спокойная работа на шагу и мероприятия' },
] as const
export type HorseServiceDirection = typeof horseServiceSettings[number]['key']

// Legacy services retain the name/capacity fallback until a direction is selected.
export function horseServiceDirection(service?: Pick<Service, 'title' | 'name' | 'maxCapacity' | 'isPerPerson' | 'serviceDirection'>): HorseServiceDirection | undefined {
  if (!service) return undefined
  if (service.serviceDirection) return service.serviceDirection
  const name = `${service.title} ${service.name ?? ''}`
  if (/иппо|фото|мероприят|экскурс|hippo|photo|event|excursion/i.test(name)) return 'allowSpecial'
  if (/прогул|выезд(?!к)|поход|walk|trail/i.test(name)) return 'allowWalk'
  if (/групп|смен|group/i.test(name) || service.maxCapacity > 1) return 'allowGroup'
  if (/индивиду|персонал|трениров|занят|урок|выездк|конкур|корд|individual|lesson|training/i.test(name)) return 'allowIndividual'
  return 'allowSpecial'
}
export function disciplineDirection(discipline?: string): HorseServiceDirection | undefined {
  if (!discipline) return undefined
  return discipline === 'walks' ? 'allowWalk' : discipline === 'photoshoot' ? 'allowSpecial' : 'allowIndividual'
}
export function horseServiceWarning(horse: Pick<HorseValues, HorseServiceDirection> | undefined, direction?: HorseServiceDirection): string | undefined {
  if (!horse || !direction || horse[direction] !== false) return undefined
  const title = horseServiceSettings.find(setting => setting.key === direction)!.title
  return `Направление «${title}» отключено в карточке лошади. Выберите другую лошадь или уточните допуск перед записью.`
}
