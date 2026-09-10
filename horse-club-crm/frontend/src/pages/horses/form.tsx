import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Horse, HorseValues } from '../catalogs/types'

export function HorseForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<Horse, HorseValues> resource="horses" action={action}
    title={action === 'create' ? 'Новая лошадь' : 'Редактирование лошади'}
    defaults={{ maxDailyMinutes: 240, minRestMinutes: 15, isUnavailable: false }}>
    <TextField name="name" label="Кличка" required />
    <TextField name="breed" label="Порода" />
    <TextField name="riderLevel" label="Уровень всадника" max={100} />
    <NumberField name="maxDailyMinutes" label="Суточный лимит нагрузки, мин" min={1} />
    <NumberField name="minRestMinutes" label="Минимальный отдых, мин" />
    <BooleanField name="isUnavailable" label="Недоступна для занятий" />
  </CatalogForm>
}
