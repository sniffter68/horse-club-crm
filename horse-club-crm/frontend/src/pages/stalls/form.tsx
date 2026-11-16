import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import { Alert, Button, Form, Select } from 'antd'
import { useList } from '@refinedev/core'
import { isUuid } from '../../uuid'
import type { StableBuilding } from './gridLayout'
import type { Stall, StallValues } from '../catalogs/types'

export function StallForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<Stall, StallValues>
    resource="stalls"
    action={action}
    title={action === 'create' ? 'Новый денник' : 'Редактирование денника'}
    defaults={{ isUnavailable: false, type: 'STALL', row: 1, col: 1, rowSpan: 1, colSpan: 1 }}
  >
    <Form.Item name="type" label="Тип помещения"><Select options={[{ value: 'STALL', label: 'Денник' }, { value: 'PONY_PEN', label: 'Бокс пони' }, { value: 'SERVICE', label: 'Техническое помещение' }]} /></Form.Item>
    <Form.Item noStyle shouldUpdate={(prev, next) => prev.type !== next.type}>{({ getFieldValue }) => <>
      <TextField name="name" label="Название" required={getFieldValue('type') === 'SERVICE'} />
      <TextField name="number" label="Номер денника" required={getFieldValue('type') !== 'SERVICE'} max={30} />
    </>}</Form.Item>
    <BuildingFields required={action === 'create'} />
    <TextField name="description" label="Описание" max={500} multiline />
    <BooleanField name="isUnavailable" label="Временно недоступен для размещения" />
  </CatalogForm>
}

function BuildingFields({ required }: { required: boolean }) {
  const { result, query } = useList<StableBuilding>({ resource: 'stable-buildings', pagination: { mode: 'off' }, errorNotification: false, queryOptions: { retry: false } })
  return <>
    {query.error && <Alert type="error" message="Не удалось загрузить корпуса" action={<Button onClick={() => void query.refetch()}>Повторить</Button>} />}
    <Form.Item name="buildingId" label="Корпус" rules={[{ required, message: 'Выберите корпус' }, { validator: async (_, id?: string) => { if (id && !isUuid(id)) throw new Error('Выберите корпус из списка') } }]}><Select loading={query.isLoading} options={result?.data.map(b => ({ value: b.id, label: b.name }))} /></Form.Item>
    <NumberField name="row" label="Ряд" min={1} max={100} required={required} />
    <NumberField name="col" label="Колонка" min={1} max={100} required={required} />
    <NumberField name="rowSpan" label="Высота в ячейках" min={1} max={3} required={required} />
    <NumberField name="colSpan" label="Ширина в ячейках" min={1} max={2} required={required} />
  </>
}
