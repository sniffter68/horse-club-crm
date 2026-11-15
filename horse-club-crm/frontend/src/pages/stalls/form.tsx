import { BooleanField, CatalogForm, NumberField, TextField } from '../catalogs/shared'
import { Form, Select } from 'antd'
import { zones } from './mapTypes'
import type { Stall, StallValues } from '../catalogs/types'

export function StallForm({ action }: { action: 'create' | 'edit' }) {
  return <CatalogForm<Stall, StallValues>
    resource="stalls"
    action={action}
    title={action === 'create' ? 'Новый денник' : 'Редактирование денника'}
    defaults={{ isUnavailable: false, type: 'STALL', zone: 'MAIN', side: 'LEFT' }}
  >
    <Form.Item name="type" label="Тип помещения"><Select options={[{ value: 'STALL', label: 'Денник' }, { value: 'PONY_PEN', label: 'Бокс пони' }, { value: 'SERVICE', label: 'Техническое помещение' }]} /></Form.Item>
    <Form.Item noStyle shouldUpdate={(prev, next) => prev.type !== next.type}>{({ getFieldValue }) => <>
      <TextField name="name" label="Название" required={getFieldValue('type') === 'SERVICE'} />
      <TextField name="number" label="Номер денника" required={getFieldValue('type') !== 'SERVICE'} max={30} />
    </>}</Form.Item>
    <Form.Item name="zone" label="Корпус" rules={[{ required: true, message: 'Выберите корпус' }]}><Select options={Object.entries(zones).map(([value, label]) => ({ value, label }))} /></Form.Item>
    <Form.Item name="side" label="Сторона прохода" rules={[{ required: true, message: 'Выберите сторону' }]}><Select options={[{ value: 'LEFT', label: 'Левый ряд' }, { value: 'RIGHT', label: 'Правый ряд' }]} /></Form.Item>
    <NumberField name="position" label="Позиция в ряду" min={1} max={10000} required={false} />
    <TextField name="description" label="Описание" max={500} multiline />
    <BooleanField name="isUnavailable" label="Временно недоступен для размещения" />
  </CatalogForm>
}
