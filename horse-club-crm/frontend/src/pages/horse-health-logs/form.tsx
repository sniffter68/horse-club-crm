import { useSelect } from '@refinedev/antd'
import { DatePicker, Form, Input, Select } from 'antd'
import dayjs from 'dayjs'
import type { Horse } from '../catalogs/types'
import { CatalogForm } from '../catalogs/shared'
import type { HorseHealthLog, HorseHealthLogValues, HealthLogType } from './types'

const typeOptions: Array<{ value: HealthLogType; label: string }> = [
  { value: 'VACCINATION', label: 'Вакцинация' },
  { value: 'FARRIER', label: 'Коваль' },
  { value: 'DEWORMING', label: 'Дегельминтизация' },
  { value: 'INSPECTION', label: 'Осмотр' },
]

function dateValue(value: unknown) {
  return { value: value ? dayjs(String(value)) : undefined }
}

function toPayload(values: HorseHealthLogValues): HorseHealthLogValues {
  return {
    ...values,
    occurredAt: dayjs(values.occurredAt).toISOString(),
    nextDueAt: values.nextDueAt ? dayjs(values.nextDueAt).toISOString() : null,
    notes: values.notes?.trim() || null,
  }
}

export function HorseHealthLogForm({ action }: { action: 'create' | 'edit' }) {
  const { selectProps: horseSelectProps } = useSelect<Horse>({
    resource: 'horses',
    optionLabel: horse => horse.name,
    optionValue: horse => horse.id,
    pagination: { mode: 'off' },
  })

  return <CatalogForm<HorseHealthLog, HorseHealthLogValues>
    resource="horse-health-logs"
    action={action}
    title={action === 'create' ? 'Новая запись журнала здоровья' : 'Редактирование записи журнала здоровья'}
    defaults={{ type: 'INSPECTION', occurredAt: dayjs() }}
    toPayload={toPayload}
  >
    <Form.Item name="horseId" label="Лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}>
      <Select {...horseSelectProps} showSearch optionFilterProp="label" placeholder="Выберите лошадь" />
    </Form.Item>
    <Form.Item name="type" label="Тип события" rules={[{ required: true, message: 'Выберите тип события' }]}>
      <Select options={typeOptions} />
    </Form.Item>
    <Form.Item name="occurredAt" label="Дата события" getValueProps={dateValue}
      rules={[{ required: true, message: 'Укажите дату события' }]}>
      <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="nextDueAt" label="Следующая дата" getValueProps={dateValue}>
      <DatePicker showTime format="DD.MM.YYYY HH:mm" allowClear style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="notes" label="Заметки" rules={[{ max: 2000, message: 'Не более 2000 символов' }]}>
      <Input.TextArea rows={5} maxLength={2000} showCount />
    </Form.Item>
  </CatalogForm>
}
