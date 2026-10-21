import { useContext, useState, type ReactNode } from 'react'
import { useOne, type BaseRecord, type HttpError } from '@refinedev/core'
import { EditOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Spin } from 'antd'
import { useCatalogPermissions } from './permissions'
import { StableEntryModal } from '../stable/shared'
import { EntryOverlay } from '../../components/EntryOverlay'
import { API_URL, httpClient } from '../../httpClient'
import { isUuid } from '../../uuid'

import { CatalogEditContext } from './editContext'
import { CatalogFormActivity } from './CatalogFormActivity'

export function CatalogEditAction({ resource, id, children }: { resource: string; id: string; children: ReactNode }) {
  const { canManage } = useCatalogPermissions(resource)
  const [open, setOpen] = useState(false)
  if (!canManage || !isUuid(id)) return null
  return <>
    <Button aria-label="Редактировать" icon={<EditOutlined />} onClick={() => setOpen(true)}>Редактировать</Button>
    {open && <CatalogEditContext.Provider value={{ id, onClose: () => setOpen(false) }}>{children}</CatalogEditContext.Provider>}
  </>
}

export function CatalogDrawerForm<T extends BaseRecord, V extends object>({ resource, title, toPayload, children }: {
  resource: string; title: string; toPayload?: (values: V) => V; children: ReactNode
}) {
  const context = useContext(CatalogEditContext)!
  const [form] = Form.useForm<V>()
  const [uploading, setUploading] = useState(false)
  const { result, query } = useOne<T, HttpError>({ resource, id: context.id, queryOptions: { enabled: isUuid(context.id) } })
  if (!result || query.error) return <EntryOverlay variant="drawer" open title={title} onCancel={context.onClose} footer={null}>
    {query.error ? <Alert type="error" message="Не удалось загрузить запись" description={query.error.message} /> : <Spin aria-label="Загрузка записи" />}
  </EntryOverlay>
  const successMessage = resource === 'clients' ? 'Данные клиента обновлены' : resource === 'horses' ? 'Данные лошади обновлены' : 'Данные сотрудника обновлены'
  return <CatalogFormActivity.Provider value={setUploading}><StableEntryModal variant="drawer" title={title} form={form} initialValues={result} submitLabel="Сохранить" submitDisabled={uploading} resources={[resource]}
    onClose={context.onClose} onSaved={context.onClose} successMessage={successMessage} save={values => {
      if (!isUuid(context.id)) throw new Error('Некорректный идентификатор записи')
      return httpClient.patch(`${API_URL}/${resource}/${context.id}`, toPayload ? toPayload(values) : values)
    }}>{children}</StableEntryModal></CatalogFormActivity.Provider>
}
