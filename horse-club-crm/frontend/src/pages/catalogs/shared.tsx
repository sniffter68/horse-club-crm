import { ServiceCancellationAction } from '../../components/ServiceCancellationAction'
import type { ReactNode } from 'react'
import { useContext, useEffect, useState } from 'react'
import { CatalogDrawerForm } from './EditDrawer'
import { CatalogEditContext } from './editContext'
import { CatalogFormActivity } from './CatalogFormActivity'
import { type BaseRecord, type HttpError } from '@refinedev/core'
import { Create, Edit, List, EditButton, DeleteButton, useForm, useTable } from '@refinedev/antd'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Result, Select, Space, Spin, type TableColumnsType } from 'antd'
import { useCatalogPermissions } from './permissions'
import { ResponsiveTable } from '../../components/ResponsiveTable'

export function CatalogList<T extends BaseRecord>({ resource, title, columns, extraActions }: {
  resource: string; title: string; columns: TableColumnsType<T>; extraActions?: (record: T) => ReactNode
}) {
  const { canManage, role } = useCatalogPermissions(resource)
  const { tableProps, searchFormProps, tableQuery, sorters, filters, currentPage, pageSize, setCurrentPage } = useTable<T, HttpError, { q?: string; clientType?: string; archive?: string }>({
    resource, pagination: { pageSize: 10 }, sorters: { mode: 'server' },
    queryOptions: { retry: (count, error) => (error.statusCode === 0 || error.statusCode >= 500) && count < 2 },
    onSearch: ({ q, clientType, archive }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' },
      ...(resource === 'clients' ? [{ field: 'clientType', operator: 'eq' as const, value: clientType || undefined },
        { field: 'includeArchived', operator: 'eq' as const, value: archive === 'all' ? 'true' : undefined },
        { field: 'archivedOnly', operator: 'eq' as const, value: archive === 'archived' ? 'true' : undefined }] : [])],
  })
  const total = tableQuery.data?.total
  useEffect(() => {
    if (total === undefined || tableQuery.isFetching) return
    const lastPage = Math.max(1, Math.ceil(total / pageSize))
    if (currentPage > lastPage) setCurrentPage(lastPage)
  }, [total, pageSize, currentPage, setCurrentPage, tableQuery.isFetching])
  const sortedColumns = columns.map(column => {
    const sorter = sorters.find(item => item.field === column.key)
    return { ...column, sortOrder: sorter ? (sorter.order === 'asc' ? 'ascend' as const : 'descend' as const) : null }
  })
  const actions: TableColumnsType<T> = canManage ? [{
    key: 'actions', title: 'Действия', width: 250,
    render: (_: unknown, record: T) => <Space wrap>
      <EditButton resource={resource} recordItemId={record.id} size="small" aria-label="Редактировать">Редактировать</EditButton>
      {extraActions?.(record)}
      {resource === 'boarding-contracts' && <ServiceCancellationAction resource="boarding-contracts" id={String(record.id)} label="Отменить постой" />}
      {resource !== 'boarding-contracts' && resource !== 'clients' && (resource !== 'horse-health-logs' || role !== 'TRAINER') && <DeleteButton resource={resource} recordItemId={record.id} size="small" aria-label="Удалить"
        confirmTitle="Удалить запись?" confirmOkText="Удалить" confirmCancelText="Отмена">Удалить</DeleteButton>}
    </Space>,
  }] : []
  return <List title={title} canCreate={canManage} createButtonProps={{ children: 'Создать' }}>
    <Form noValidate {...searchFormProps} initialValues={{ ...searchFormProps.initialValues, clientType: filters.find(filter => 'field' in filter && filter.field === 'clientType')?.value }} layout="inline" style={{ marginBottom: 20 }}>
      <Form.Item name="q" style={{ width: 320, maxWidth: '100%' }}>
        <Input.Search aria-label="Поиск" placeholder="Поиск" allowClear onSearch={() => searchFormProps.form?.submit()} />
      </Form.Item>
      {resource === 'clients' && <Form.Item name="clientType"><Select aria-label="Тип клиента" allowClear placeholder="Все клиенты" style={{ width: 200 }}
        onChange={() => searchFormProps.form?.submit()} options={[{ value: 'REGULAR', label: 'Постоянные' }, { value: 'ONE_TIME', label: 'Разовые' }]} /></Form.Item>}
      {resource === 'clients' && <Form.Item name="archive" initialValue={filters.some(f => 'field' in f && f.field === 'archivedOnly' && f.value === 'true') ? 'archived' : filters.some(f => 'field' in f && f.field === 'includeArchived' && f.value === 'true') ? 'all' : 'active'}>
        <Select aria-label="Архив клиентов" style={{ width: 190 }} onChange={() => searchFormProps.form?.submit()}
          options={[{ value: 'all', label: 'Все' }, { value: 'active', label: 'Только активные' }, { value: 'archived', label: 'Архив' }]} />
      </Form.Item>}
      <Button type="primary" htmlType="submit">Найти</Button>
    </Form>
    {tableQuery.error && <Alert type="error" showIcon message="Не удалось загрузить каталог" description={tableQuery.error.message} />}
    <ResponsiveTable<T> {...tableProps} rowKey="id" columns={[...sortedColumns, ...actions]} scroll={{ x: 'max-content' }}
      pagination={{ ...tableProps.pagination, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: total => `Всего: ${total}` }} />
  </List>
}

export function CatalogForm<T extends BaseRecord, V extends object>({ resource, action, title, defaults, toPayload, children }: {
  resource: string; action: 'create' | 'edit'; title: string; defaults?: Partial<V>; toPayload?: (values: V) => V; children: ReactNode
}) {
  const drawer = useContext(CatalogEditContext)
  const { canManage, isLoading } = useCatalogPermissions(resource)
  if (isLoading) return <Spin />
  if (!canManage) return <Result status="403" title="Доступ только для чтения" subTitle="Изменять каталоги могут администратор и менеджер." />
  if (drawer) return <CatalogDrawerForm<T, V> resource={resource} title={title} toPayload={toPayload}>{children}</CatalogDrawerForm>
  return <WritableCatalogForm<T, V> resource={resource} action={action} title={title} defaults={defaults} toPayload={toPayload}>{children}</WritableCatalogForm>
}

function WritableCatalogForm<T extends BaseRecord, V extends object>({ resource, action, title, defaults, toPayload, children }: {
  resource: string; action: 'create' | 'edit'; title: string; defaults?: Partial<V>; toPayload?: (values: V) => V; children: ReactNode
}) {
  const [uploading, setUploading] = useState(false)
  const { formProps, saveButtonProps, formLoading, query } = useForm<T, HttpError, V>({ resource, action, redirect: 'list',
    queryOptions: { retry: (count, error) => (error.statusCode === 0 || error.statusCode >= 500) && count < 2 },
  })
  const Wrapper = action === 'create' ? Create : Edit
  return <CatalogFormActivity.Provider value={setUploading}><Wrapper title={title} isLoading={formLoading} canDelete={false}
    saveButtonProps={{ ...saveButtonProps, children: 'Сохранить', 'aria-label': 'Сохранить', disabled: saveButtonProps.disabled || !!query?.error || uploading }}>
    {query?.error ? <Alert type="error" showIcon message="Не удалось загрузить запись" description={query.error.message} /> :
      <Form<V> {...formProps} noValidate onFinish={values => !uploading && formProps.onFinish?.(toPayload ? toPayload(values) : values)} layout="vertical" style={{ maxWidth: 720 }}
        initialValues={action === 'create' ? defaults : formProps.initialValues}>
        {children}
      </Form>}
  </Wrapper></CatalogFormActivity.Provider>
}

export function TextField({ name, label, required = false, max = 150, multiline = false, email = false }: {
  name: string; label: string; required?: boolean; max?: number; multiline?: boolean; email?: boolean
}) {
  return <Form.Item name={name} label={label} rules={[
    { required, whitespace: required, message: `Заполните поле «${label}»` },
    { max, message: `Не более ${max} символов` },
    ...(email ? [{ type: 'email' as const, message: 'Введите корректный email' }] : []),
  ]} normalize={(value: string) => email && value === '' ? null : value}>
    {multiline ? <Input.TextArea aria-label={label} rows={4} maxLength={max} /> : <Input aria-label={label} maxLength={max} />}
  </Form.Item>
}

export function NumberField({ name, label, min = 0, max = 1440, precision = 0, required = true }: {
  name: string; label: string; min?: number; max?: number; precision?: number; required?: boolean
}) {
  return <Form.Item name={name} label={label} rules={[
    { required, message: `Заполните поле «${label}»` },
    { type: precision === 0 ? 'integer' : 'number', min, max, transform: (value: unknown) => value == null ? value : Number(value), message: `Допустимо от ${min} до ${max}` },
  ]} getValueProps={(value: unknown) => ({ value: value === undefined || value === null ? undefined : Number(value) })}>
    <InputNumber aria-label={label} min={min} max={max} precision={precision} style={{ width: '100%' }} />
  </Form.Item>
}

export function BooleanField({ name, label }: { name: string; label: string }) {
  return <Form.Item name={name} valuePropName="checked"><Checkbox>{label}</Checkbox></Form.Item>
}
