import { useCatalogPermissions } from '../catalogs/permissions'
import { CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Trainer, TrainerValues } from '../catalogs/types'

export function TrainerForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  return <CatalogForm<Trainer, TrainerValues> resource="trainers" action={action}
    title={action === 'create' ? 'Новый тренер' : 'Редактирование тренера'} defaults={{ maxDailyLoad: 480, baseRate: 0 }}
    toPayload={values => ({ ...values, baseRate: Number(values.baseRate) })}>
    <TextField name="name" label="ФИО" required />
    <TextField name="phone" label="Телефон" max={40} />
    <TextField name="qualification" label="Квалификация" multiline max={1000} />
    <NumberField name="maxDailyLoad" label="Дневная нагрузка, мин" min={1} />
    {canManage && <NumberField name="baseRate" label="Базовая ставка, ₽" precision={2} max={9999999999.99} />}
  </CatalogForm>
}
