import { CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { PricingPlan, PricingPlanValues } from './types'

export function PricingPlanForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<PricingPlan, PricingPlanValues> resource="pricing-plans" action={action}
    title={action === 'create' ? 'Новый тариф' : 'Редактирование тарифа'}
    defaults={{ totalLessons: 8, validDays: 30, price: 0 }}
    toPayload={values => ({ ...values, name: values.name.trim(), price: Number(values.price) })}>
    <TextField name="name" label="Название" required />
    <NumberField name="totalLessons" label="Количество занятий" min={1} max={10000} />
    <NumberField name="validDays" label="Срок действия, дней" min={1} max={3650} />
    <NumberField name="price" label="Цена, ₽" precision={2} max={9999999999.99} />
  </CatalogForm>
}
