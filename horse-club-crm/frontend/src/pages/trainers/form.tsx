import { PublicationFields } from '../catalogs/PublicationFields'
import { useCatalogPermissions } from '../catalogs/permissions'
import { CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Trainer, TrainerValues } from '../catalogs/types'
import { usePermissions } from '../../modulePermissions'

export function TrainerForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  const { canWrite } = usePermissions()
  const editRate = canManage && canWrite('STAFF_PAYROLL')
  return <CatalogForm<Trainer, TrainerValues> resource="trainers" action={action}
    title={action === 'create' ? 'Новый тренер' : 'Редактирование тренера'} defaults={{ isPublic: true, order: 0, maxDailyLoad: 480, baseRate: 0 }}
    toPayload={({ baseRate, ...values }) => ({ ...values, ...(editRate ? { baseRate: Number(baseRate) } : {}) })}>
    <TextField name="name" label="ФИО" required />
    <TextField name="phone" label="Телефон" max={40} />
    <TextField name="qualification" label="Квалификация" multiline max={1000} />
    <NumberField name="maxDailyLoad" label="Дневная нагрузка, мин" min={1} />
    {editRate && <NumberField name="baseRate" label="Базовая ставка, ₽" precision={2} max={9999999999.99} />}
    <PublicationFields />
  </CatalogForm>
}
