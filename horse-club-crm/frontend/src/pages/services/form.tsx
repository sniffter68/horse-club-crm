import { PublicationFields } from '../catalogs/PublicationFields'
import { useCatalogPermissions } from '../catalogs/permissions'
import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Service, ServiceValues } from '../catalogs/types'
import { Form, InputNumber, Select } from 'antd'
import { ToggleSettingRow } from '../../components/ToggleSettingRow'
import { serviceDirectionOptions } from './serviceDirections'
import { useId } from 'react'

export function ServiceGroupFields({ id, value = 1, onChange }: { id?: string; value?: number | null; onChange?: (value: number | null) => void }) {
  const form = Form.useFormInstance<ServiceValues>()
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const { errors } = Form.Item.useStatus()
  const perPerson = Form.useWatch<boolean>('isPerPerson', form) ?? false
  return <ToggleSettingRow id={fieldId} title="Групповая услуга" description="Несколько участников на одном занятии. Направление выбирается отдельно."
    checked={value === null || value > 1} onChange={checked => onChange?.(checked ? 4 : 1)}>
    <Form.Item label="Максимум участников" htmlFor={`${fieldId}-capacity`}>
      <InputNumber id={`${fieldId}-capacity`} aria-label="Максимум участников" aria-invalid={errors.length > 0} aria-describedby={errors.length > 0 ? `${fieldId}_help` : undefined}
        value={value} onChange={onChange} min={2} max={1000} precision={0} style={{ width: '100%' }} />
    </Form.Item>
    <p>{perPerson ? 'Цена указана за одного участника. Для записи через организатора общая стоимость — цена × число участников.' : 'При отдельных записях цена начисляется каждому клиенту. Для группового мероприятия с одним организатором включите «Цена за одного участника».'}</p>
  </ToggleSettingRow>
}

export function ServiceForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  return <CatalogForm<Service, ServiceValues> resource="services" action={action}
    title={action === 'create' ? 'Новая услуга' : 'Редактирование услуги'}
    defaults={{ serviceDirection: 'allowIndividual', isPublic: true, order: 0, durationMinutes: 60, maxCapacity: 1, price: 0, cancellationWindowHours: 24, allowMembership: true }}
    toPayload={values => ({ ...values, title: values.title.trim(), name: values.title.trim(), price: Number(values.price) })}>
    <TextField name="title" label="Название" required />
    <NumberField name="durationMinutes" label="Длительность, мин" min={1} />
    <Form.Item name="serviceDirection" label="Направление занятия" rules={[{ required: true, message: 'Выберите направление занятия' }]}>
      <Select aria-label="Направление занятия" options={serviceDirectionOptions} />
    </Form.Item>
    <Form.Item name="maxCapacity" rules={[{ required: true, type: 'integer', min: 1, max: 1000, message: 'Укажите целое число участников от 2 до 1000 для группы' }]}>
      <ServiceGroupFields />
    </Form.Item>
    {canManage && <NumberField name="price" label="Цена, ₽" precision={2} max={9999999999.99} />}
    <NumberField name="cancellationWindowHours" label="Окно бесплатной отмены, ч" max={8760} />
    <BooleanField name="isPerPerson" label="Цена за одного участника" />
    <BooleanField name="allowMembership" label="Разрешена оплата абонементом" />
    <PublicationFields />
  </CatalogForm>
}
