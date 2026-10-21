import { useCatalogPermissions } from '../catalogs/permissions'
import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import type { Client, ClientValues } from '../catalogs/types'
import { ClientIdentityFields } from './identity'
import { clientIdentityPayload } from './identityPayload'
import { DatePicker, Form } from 'antd'
import dayjs from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'

export function ClientForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  const medicalNotesEnabled = import.meta.env.VITE_ENABLE_MEDICAL_NOTES === 'true'
  return <CatalogForm<Client, ClientValues> resource="clients" action={action}
    title={action === 'create' ? 'Новый клиент' : 'Редактирование клиента'} defaults={{ isRider: true, isPayer: false }}
    toPayload={values => ({ ...values, ...clientIdentityPayload(values) })}>
    <NumberField name="weightKg" label="Вес всадника, кг" min={0.01} max={999.99} precision={2} required={false} />
    <ClientIdentityFields />
    <TextField name="email" label="Email" email max={254} />
    <Form.Item name="birthDate" label="Дата рождения" getValueProps={value => ({ value: value ? dayjs(value) : null })}
      getValueFromEvent={value => value ? value.format('YYYY-MM-DD') : null}>
      <DatePicker aria-label="Дата рождения" locale={ruDatePicker} format="DD.MM.YYYY" maxDate={dayjs()} />
    </Form.Item>
    <TextField name="riderLevel" label="Уровень опыта" max={100} />
    <BooleanField name="isRider" label="Всадник" />
    <BooleanField name="isPayer" label="Плательщик" />
    <TextField name="preferences" label="Заметки и предпочтения" multiline max={5000} />
    {canManage && medicalNotesEnabled && <TextField name="medicalNotes" label="Медицинские заметки" multiline max={5000} />}
  </CatalogForm>
}
