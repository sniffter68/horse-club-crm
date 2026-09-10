import type { ReactNode } from 'react'
import { type BaseRecord, type HttpError } from '@refinedev/core'
import { Create, Edit, List, EditButton, DeleteButton, useForm, useTable } from '@refinedev/antd'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Result, Space, Spin, Table, type TableColumnsType } from 'antd'
import { useCatalogPermissions } from './permissions'

export function CatalogList<T extends BaseRecord>({ resource, title, columns }: {
  resource: string; title: string; columns: TableColumnsType<T>
}) {
  const { canManage } = useCatalogPermissions()
  const { tableProps, searchFormProps, tableQuery, sorters } = useTable<T, HttpError, { q?: string }>({
    resource, pagination: { pageSize: 10 }, sorters: { mode: 'server' },
    queryOptions: { retry: (count, error) => (error.statusCode === 0 || error.statusCode >= 500) && count < 2 },
    onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }],
  })
  const sortedColumns = columns.map(column => {
    const sorter = sorters.find(item => item.field === column.key)
    return { ...column, sortOrder: sorter ? (sorter.order === 'asc' ? 'ascend' as const : 'descend' as const) : null }
  })
  const actions: TableColumnsType<T> = canManage ? [{
    key: 'actions', title: 'Действия', width: 250,
    render: (_: unknown, record: T) => <Space>
      <EditButton resource={resource} recordItemId={record.id} size="small" aria-label="Редактировать">Редактировать</EditButton>
      <DeleteButton resource={resource} recordItemId={record.id} size="small" aria-label="Удалить"
        confirmTitle="Удалить запись?" confirmOkText="Удалить" confirmCancelText="Отмена">Удалить</DeleteButton>
    </Space>,
  }] : []
  return <List title={title} canCreate={canManage} createButtonProps={{ children: 'Создать' }}>
    <Form {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}>
      <Form.Item name="q" style={{ width: 320, maxWidth: '100%' }}>
        <Input.Search aria-label="Поиск" placeholder="Поиск" allowClear onSearch={() => searchFormProps.form?.submit()} />
      </Form.Item>
      <Button htmlType="submit">Найти</Button>
    </Form>
    {tableQuery.error && <Alert type="error" showIcon message="Не удалось загрузить каталог" description={tableQuery.error.message} />}
    <Table<T> {...tableProps} rowKey="id" columns={[...sortedColumns, ...actions]} scroll={{ x: 'max-content' }}
      pagination={{ ...tableProps.pagination, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: total => `Всего: ${total}` }} />
  </List>
}

export function CatalogForm<T extends BaseRecord, V extends object>({ resource, action, title, defaults, toPayload, children }: {
  resource: string; action: 'create' | 'edit'; title: string; defaults?: Partial<V>; toPayload?: (values: V) => V; children: ReactNode
}) {
  const { canManage, isLoading } = useCatalogPermissions()
  if (isLoading) return <Spin />
  if (!canManage) return <Result status="403" title="Доступ только для чтения" subTitle="Изменять каталоги могут администратор и менеджер." />
  return <WritableCatalogForm<T, V> resource={resource} action={action} title={title} defaults={defaults} toPayload={toPayload}>{children}</WritableCatalogForm>
}

function WritableCatalogForm<T extends BaseRecord, V extends object>({ resource, action, title, defaults, toPayload, children }: {
  resource: string; action: 'create' | 'edit'; title: string; defaults?: Partial<V>; toPayload?: (values: V) => V; children: ReactNode
}) {
  const { formProps, saveButtonProps, formLoading, query } = useForm<T, HttpError, V>({ resource, action, redirect: 'list',
    queryOptions: { retry: (count, error) => (error.statusCode === 0 || error.statusCode >= 500) && count < 2 },
  })
  const Wrapper = action === 'create' ? Create : Edit
  return <Wrapper title={title} isLoading={formLoading} canDelete={false}
    saveButtonProps={{ ...saveButtonProps, children: 'Сохранить', 'aria-label': 'Сохранить', disabled: saveButtonProps.disabled || !!query?.error }}>
    {query?.error ? <Alert type="error" showIcon message="Не удалось загрузить запись" description={query.error.message} /> :
      <Form<V> {...formProps} onFinish={values => formProps.onFinish?.(toPayload ? toPayload(values) : values)} layout="vertical" style={{ maxWidth: 720 }}
        initialValues={action === 'create' ? defaults : formProps.initialValues}>
        {children}
      </Form>}
  </Wrapper>
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

export function NumberField({ name, label, min = 0, max = 1440, precision = 0 }: {
  name: string; label: string; min?: number; max?: number; precision?: number
}) {
  return <Form.Item name={name} label={label} rules={[
    { required: true, message: `Заполните поле «${label}»` },
    { type: precision === 0 ? 'integer' : 'number', min, max, transform: (value: unknown) => value == null ? value : Number(value), message: `Допустимо от ${min} до ${max}` },
  ]} getValueProps={(value: unknown) => ({ value: value === undefined || value === null ? undefined : Number(value) })}>
    <InputNumber aria-label={label} min={min} max={max} precision={precision} style={{ width: '100%' }} />
  </Form.Item>
}

export function BooleanField({ name, label }: { name: string; label: string }) {
  return <Form.Item name={name} valuePropName="checked"><Checkbox>{label}</Checkbox></Form.Item>
}
