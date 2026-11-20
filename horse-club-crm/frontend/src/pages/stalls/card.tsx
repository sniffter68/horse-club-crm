import { useRef, useState, type ReactNode } from 'react'
import { useInvalidate, useOnError, useOne, type HttpError } from '@refinedev/core'
import { Alert, App, Button, Descriptions, Form, Input, Select, Space, Spin, Tag } from 'antd'
import { Pencil } from 'lucide-react'
import { EntryOverlay } from '../../components/EntryOverlay'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Stall } from '../catalogs/types'
import { StallDeleteAction } from './delete'
import { BuildingFields } from './form'
import { statuses } from './mapTypes'

interface CardRoom {
  id: string; name?: string | null; number?: string | null; type?: 'STALL' | 'PONY_PEN' | 'SERVICE'
  buildingId?: string | null; description?: string | null; horseId?: string | null
  status?: keyof typeof statuses; notes?: string | null; isUnavailable?: boolean
  contracts?: Array<{ status: string }>
}
interface RoomValues {
  name: string; number: string; type: NonNullable<CardRoom['type']>; buildingId?: string
  description: string; status?: keyof typeof statuses; notes?: string
}
const roomTypes = [{ value: 'STALL', label: 'Денник' }, { value: 'PONY_PEN', label: 'Бокс пони' }, { value: 'SERVICE', label: 'Служебное помещение' }]

export function StallCard({ stall, children, onClose, onSaved, mapFields = false, disabled = false }: {
  stall: CardRoom; children?: ReactNode; onClose: () => void; onSaved?: () => Promise<unknown>; mapFields?: boolean; disabled?: boolean
}) {
  const { canManage } = useCatalogPermissions('stalls')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm<RoomValues>()
  const lock = useRef(false)
  const { modal, message } = App.useApp()
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const occupied = Boolean(stall.horseId || stall.status === 'OCCUPIED' || stall.contracts?.some(c => c.status === 'ACTIVE' || c.status === 'SUSPENDED'))
  const cancel = (close: () => void) => {
    if (lock.current) return
    if (editing && form.isFieldsTouched()) modal.confirm({ title: 'Закрыть без сохранения?', content: 'Введённые данные будут потеряны.', okText: 'Закрыть', cancelText: 'Продолжить заполнение', onOk: close })
    else close()
  }
  const startEditing = () => {
    form.resetFields()
    form.setFieldsValue({ name: stall.name ?? '', number: stall.number ?? '', type: stall.type ?? 'STALL', buildingId: stall.buildingId ?? undefined,
      description: stall.description ?? '', ...(mapFields ? { status: stall.status, notes: stall.notes ?? '' } : {}) })
    form.setFields((['name', 'number', 'type', 'buildingId', 'description', 'status', 'notes'] as const).map(name => ({ name, touched: false })))
    setError(undefined); setEditing(true)
  }
  const save = async (values: RoomValues) => {
    if (lock.current || !canManage || !isUuid(stall.id)) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/stalls/${stall.id}`, { ...values, name: values.name.trim(), number: values.type === 'SERVICE' ? '' : values.number.trim() })
      await Promise.all(['stalls', 'stable-buildings', 'horses'].map(resource => invalidate({ resource, invalidates: ['resourceAll'] })))
      await onSaved?.()
      setEditing(false); void message.success('Денник сохранён')
    } catch (cause) {
      const failure = toHttpError(cause); setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { lock.current = false; setBusy(false) }
  }
  return <EntryOverlay variant="drawer" open title="Карточка денника" width={620} destroyOnHidden
    onCancel={() => cancel(onClose)} maskClosable={!busy} keyboard={!busy} closable={!busy}
    footer={editing ? <Space wrap>
      <Button disabled={busy} onClick={() => cancel(() => setEditing(false))}>Отмена</Button>
      <Button type="primary" aria-label="Сохранить" aria-busy={busy} loading={busy} disabled={busy || !canManage} onClick={() => form.submit()}>Сохранить</Button>
    </Space> : null}>
    {editing ? <Form form={form} layout="vertical" noValidate disabled={busy || !canManage} onFinish={save} scrollToFirstError={{ focus: true }}>
      <Form.Item name="type" label="Тип помещения"><Select options={roomTypes.map(option => ({ ...option, disabled: option.value === 'SERVICE' && occupied }))} /></Form.Item>
      <Form.Item noStyle shouldUpdate={(prev: RoomValues, next: RoomValues) => prev.type !== next.type}>{({ getFieldValue }) => <>
        <Form.Item name="name" label="Название" rules={[{ required: getFieldValue('type') === 'SERVICE', whitespace: true, message: 'Укажите название' }, { max: 150 }]}><Input aria-label="Название" maxLength={150} autoFocus /></Form.Item>
        {getFieldValue('type') !== 'SERVICE' && <Form.Item name="number" label="Номер денника" rules={[{ required: true, whitespace: true, message: 'Укажите номер денника' }, { max: 30 }]}><Input aria-label="Номер денника" maxLength={30} /></Form.Item>}
      </>}</Form.Item>
      <BuildingFields required={false} placement={false} />
      <Form.Item name="description" label="Описание" rules={[{ max: 500 }]}><Input.TextArea maxLength={500} autoSize={{ minRows: 3, maxRows: 8 }} style={{ resize: 'none' }} /></Form.Item>
      {mapFields && <>
        {stall.type !== 'SERVICE' && <Form.Item name="status" label="Статус денника"><Select options={Object.entries(statuses).filter(([key]) => stall.horseId ? key === 'OCCUPIED' : key !== 'OCCUPIED').map(([value, label]) => ({ value, label }))} /></Form.Item>}
        <Form.Item name="notes" label="Заметки для конюха" rules={[{ max: 5000 }]}><Input.TextArea maxLength={5000} autoSize={{ minRows: 3, maxRows: 10 }} style={{ resize: 'none' }} /></Form.Item>
      </>}
      {error && <Alert type="error" showIcon message="Денник не сохранён" description={error} />}
    </Form> : <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {canManage && isUuid(stall.id) && <Space wrap>
        <Button disabled={disabled} icon={<Pencil size={16} aria-hidden />} onClick={startEditing}>Редактировать</Button>
        {!occupied && <StallDeleteAction id={stall.id} disabled={disabled} name={stall.name || stall.number || undefined} onDeleted={() => { onClose(); void onSaved?.() }} />}
      </Space>}
      <Descriptions bordered size="small" column={1} items={[
        { key: 'name', label: 'Название', children: stall.name || '—' },
        ...(stall.type === 'SERVICE' ? [] : [{ key: 'number', label: 'Номер денника', children: stall.number || '—' }]),
        { key: 'type', label: 'Тип помещения', children: roomTypes.find(t => t.value === (stall.type ?? 'STALL'))?.label },
        ...(stall.type === 'SERVICE' ? [] : [{ key: 'status', label: 'Статус', children: <Tag color={stall.isUnavailable ? 'red' : 'green'}>{stall.isUnavailable ? 'Недоступен' : stall.status ? statuses[stall.status] : 'Доступен'}</Tag> }]),
        { key: 'description', label: 'Описание', children: <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{stall.description || '—'}</span> },
      ]} />
      {children}
    </Space>}
  </EntryOverlay>
}

export function StallDetailsCard({ id, onClose, children }: { id: string; onClose: () => void; children: (stall: Stall) => ReactNode }) {
  const { result, query } = useOne<Stall, HttpError>({ resource: 'stalls', id, queryOptions: { enabled: isUuid(id) } })
  if (!result || query.isLoading || query.error) return <EntryOverlay variant="drawer" open title="Карточка денника" onCancel={onClose} footer={null}>
    {query.error ? <Alert type="error" message="Не удалось загрузить карточку" description={query.error.message} action={<Button onClick={() => void query.refetch()}>Повторить</Button>} /> : <Spin aria-label="Загрузка карточки денника" />}
  </EntryOverlay>
  return <StallCard stall={result} onClose={onClose}>{children(result)}</StallCard>
}
