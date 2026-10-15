import { PublicationFields } from '../catalogs/PublicationFields'
import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Horse, HorseValues } from '../catalogs/types'
import { useParams } from 'react-router-dom'
import { HorseIssues } from '../schedule/HorseIssues'

export function HorseForm({ action }: { action: 'create' | 'edit' }) {
  const { id } = useParams()
  return <CatalogForm<Horse, HorseValues> resource="horses" action={action}
    title={action === 'create' ? 'Новая лошадь' : 'Редактирование лошади'}
    defaults={{ isPublic: true, order: 0, maxRiderWeight: 85, maxDailyMinutes: 240, minRestMinutes: 15, isUnavailable: false }}>
    <NumberField name="maxRiderWeight" label="Максимальный вес всадника, кг" min={1} max={1000} />
    <TextField name="name" label="Кличка" required />
    <TextField name="breed" label="Порода" />
    <TextField name="riderLevel" label="Уровень всадника" max={100} />
    <TextField name="feedingNotes" label="Режим кормления" max={5000} multiline />
    <NumberField name="maxDailyMinutes" label="Суточный лимит нагрузки, мин" min={1} />
    <NumberField name="minRestMinutes" label="Минимальный отдых, мин" />
    <BooleanField name="isUnavailable" label="Недоступна для занятий" />
    {action === 'edit' && id && <HorseIssues horseId={id} readOnly />}
    <PublicationFields />
  </CatalogForm>
}
