import { useCatalogPermissions } from '../catalogs/permissions'
import { BooleanField, CatalogForm, TextField } from '../catalogs/shared'
import type { Client, ClientValues } from '../catalogs/types'

export function ClientForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage } = useCatalogPermissions()
  return <CatalogForm<Client, ClientValues> resource="clients" action={action}
    title={action === 'create' ? 'Новый клиент' : 'Редактирование клиента'} defaults={{ isRider: true, isPayer: false }}
    toPayload={values => ({ ...values, firstName: values.firstName.trim(), lastName: values.lastName?.trim() ?? '',
      name: [values.firstName.trim(), values.lastName?.trim()].filter(Boolean).join(' '), phone: values.phone.trim() })}>
    <TextField name="firstName" label="Имя" required max={75} />
    <TextField name="lastName" label="Фамилия" max={74} />
    <TextField name="phone" label="Телефон" required max={40} />
    <TextField name="email" label="Email" email max={254} />
    <BooleanField name="isRider" label="Всадник" />
    <BooleanField name="isPayer" label="Плательщик" />
    <TextField name="preferences" label="Заметки и предпочтения" multiline max={5000} />
    {canManage && <TextField name="medicalNotes" label="Медицинские заметки" multiline max={5000} />}
  </CatalogForm>
}
