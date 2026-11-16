import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import { Alert, Button, Form, Select } from 'antd'
import { useEffect, useState } from 'react'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
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
  const [buildings, setBuildings] = useState<StableBuilding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      if (controller.signal.aborted) return
      setLoading(true); setError(undefined)
      try {
        const { data } = await httpClient.get<StableBuilding[]>(`${API_URL}/stable-buildings`, { signal: controller.signal })
        if (!controller.signal.aborted) setBuildings(data)
      } catch (cause) {
        if (!controller.signal.aborted) setError(toHttpError(cause).message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void Promise.resolve().then(load)
    return () => controller.abort()
  }, [attempt])
  return <>
    {error && <Alert type="error" message="Не удалось загрузить корпуса" description={error} action={<Button disabled={loading} onClick={() => setAttempt(value => value + 1)}>Повторить</Button>} />}
    <Form.Item name="buildingId" label="Корпус" rules={[{ required, message: 'Выберите корпус' }, { validator: async (_, id?: string) => { if (id && !isUuid(id)) throw new Error('Выберите корпус из списка') } }]}><Select loading={loading} options={buildings.map(b => ({ value: b.id, label: b.name }))} /></Form.Item>
    <NumberField name="row" label="Ряд" min={1} max={100} required={required} />
    <NumberField name="col" label="Колонка" min={1} max={100} required={required} />
    <NumberField name="rowSpan" label="Высота в ячейках" min={1} max={3} required={required} />
    <NumberField name="colSpan" label="Ширина в ячейках" min={1} max={2} required={required} />
  </>
}
