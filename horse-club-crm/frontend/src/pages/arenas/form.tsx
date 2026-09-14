import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Arena, ArenaValues } from '../catalogs/types'

export function ArenaForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<Arena, ArenaValues> resource="arenas" action={action}
    title={action === 'create' ? 'Новый манеж' : 'Редактирование манежа'}
    defaults={{ capacity: 1, isUnavailable: false }}>
    <TextField name="name" label="Название" required />
    <TextField name="description" label="Описание" max={500} multiline />
    <NumberField name="capacity" label="Вместимость" min={1} max={100} />
    <BooleanField name="isUnavailable" label="Временно недоступен для занятий" />
  </CatalogForm>
}
