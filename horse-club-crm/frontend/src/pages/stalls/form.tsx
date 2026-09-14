import { BooleanField, CatalogForm, TextField } from '../catalogs/shared'
import type { Stall, StallValues } from '../catalogs/types'

export function StallForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<Stall, StallValues>
    resource="stalls"
    action={action}
    title={action === 'create' ? 'Новый денник' : 'Редактирование денника'}
    defaults={{ isUnavailable: false }}
  >
    <TextField name="name" label="Название" required />
    <TextField name="description" label="Описание" max={500} multiline />
    <BooleanField name="isUnavailable" label="Временно недоступен для размещения" />
  </CatalogForm>
}
