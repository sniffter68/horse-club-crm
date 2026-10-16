import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import { Form, Select } from 'antd'
import { zones } from './mapTypes'
import type { Stall, StallValues } from '../catalogs/types'

export function StallForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<Stall, StallValues>
    resource="stalls"
    action={action}
    title={action === 'create' ? 'Новый денник' : 'Редактирование денника'}
    defaults={{ isUnavailable: false, zone: 'MAIN', side: 'LEFT' }}
  >
    <TextField name="name" label="Название" required />
    <TextField name="number" label="Номер денника" required max={30} />
    <Form.Item name="zone" label="Корпус" rules={[{ required: true, message: 'Выберите корпус' }]}><Select options={Object.entries(zones).map(([value, label]) => ({ value, label }))} /></Form.Item>
    <Form.Item name="side" label="Сторона прохода" rules={[{ required: true, message: 'Выберите сторону' }]}><Select options={[{ value: 'LEFT', label: 'Левый ряд' }, { value: 'RIGHT', label: 'Правый ряд' }]} /></Form.Item>
    <NumberField name="position" label="Позиция в ряду" min={1} max={10000} />
    <TextField name="description" label="Описание" max={500} multiline />
    <BooleanField name="isUnavailable" label="Временно недоступен для размещения" />
  </CatalogForm>
}
