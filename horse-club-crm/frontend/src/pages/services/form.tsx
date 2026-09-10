import { useCatalogPermissions } from '../catalogs/permissions'
import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Service, ServiceValues } from '../catalogs/types'

export function ServiceForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  return <CatalogForm<Service, ServiceValues> resource="services" action={action}
    title={action === 'create' ? 'Новая услуга' : 'Редактирование услуги'}
    defaults={{ durationMinutes: 60, maxCapacity: 1, price: 0, cancellationWindowHours: 24, allowMembership: true }}
    toPayload={values => ({ ...values, title: values.title.trim(), name: values.title.trim(), price: Number(values.price) })}>
    <TextField name="title" label="Название" required />
    <NumberField name="durationMinutes" label="Длительность, мин" min={1} />
    <NumberField name="maxCapacity" label="Вместимость" min={1} max={1000} />
    {canManage && <NumberField name="price" label="Цена, ₽" precision={2} max={9999999999.99} />}
    <NumberField name="cancellationWindowHours" label="Окно бесплатной отмены, ч" max={8760} />
    <BooleanField name="allowMembership" label="Разрешена оплата абонементом" />
  </CatalogForm>
}
