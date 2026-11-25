import type { ServiceValues } from '../catalogs/types'

export const serviceDirectionOptions: { value: NonNullable<ServiceValues['serviceDirection']>; label: string }[] = [
  { value: 'allowIndividual', label: 'Индивидуальная тренировка' },
  { value: 'allowGroup', label: 'Групповое занятие' },
  { value: 'allowWalk', label: 'Прогулка / выезд' },
  { value: 'allowSpecial', label: 'Иппотерапия / фотосессия' },
]
