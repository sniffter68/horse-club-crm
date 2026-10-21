import { PublicationFields } from '../catalogs/PublicationFields'
import { useCatalogPermissions } from '../catalogs/permissions'
import { CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Trainer, TrainerValues } from '../catalogs/types'
import { usePermissions } from '../../modulePermissions'
import { PhoneField } from '../../components/PhoneField'
import { phonePayload } from '../../components/formatPhone'
import { Form, Input } from 'antd'

export function TrainerForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  const { canWrite } = usePermissions()
  const editRate = canManage && canWrite('STAFF_PAYROLL')
  return <CatalogForm<Trainer, TrainerValues> resource="trainers" action={action}
    title={action === 'create' ? 'Новый тренер' : 'Редактирование тренера'} defaults={{ isPublic: true, order: 0, maxDailyLoad: 480, baseRate: 0 }}
    toPayload={({ baseRate, ...values }) => ({ ...values, phone: phonePayload(values.phone), ...(editRate ? { baseRate: Number(baseRate) } : {}) })}>
    <TextField name="name" label="ФИО" required />
    <PhoneField />
    <Form.Item name="scheduleColor" label="Цвет в расписании" rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: 'Укажите цвет в формате #724C39' }]}><Input aria-label="Цвет в расписании" placeholder="#724C39" maxLength={7} /></Form.Item>
    <TextField name="qualification" label="Роль / специализация" multiline max={1000} />
    <NumberField name="maxDailyLoad" label="Дневная нагрузка, мин" min={1} />
    {editRate && <NumberField name="baseRate" label="Базовая ставка, ₽" precision={2} max={9999999999.99} />}
    <PublicationFields />
  </CatalogForm>
}
