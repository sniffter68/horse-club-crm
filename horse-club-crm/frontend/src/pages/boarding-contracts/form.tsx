import { useSelect } from '@refinedev/antd'
import { DatePicker, Form, Input, InputNumber, Select } from 'antd'
import dayjs from 'dayjs'
import type { Client, Horse, Stall } from '../catalogs/types'
import { CatalogForm } from '../catalogs/shared'
import type { BoardingContract, BoardingContractStatus, BoardingContractValues } from './types'

const statusOptions: Array<{ value: BoardingContractStatus; label: string }> = [
  { value: 'DRAFT', label: 'Черновик' },
  { value: 'ACTIVE', label: 'Активен' },
  { value: 'SUSPENDED', label: 'Приостановлен' },
  { value: 'TERMINATED', label: 'Завершён' },
  { value: 'EXPIRED', label: 'Истёк' },
]

function dateValue(value: unknown) {
  return { value: value ? dayjs(String(value)) : undefined }
}

function clientName(client: Client): string {
  return [client.firstName, client.lastName].filter(Boolean).join(' ') || client.name || 'Без имени'
}

function toPayload(values: BoardingContractValues): BoardingContractValues {
  return {
    ...values,
    stallId: values.stallId || null,
    startsAt: dayjs(values.startsAt).toISOString(),
    endsAt: values.endsAt ? dayjs(values.endsAt).toISOString() : null,
    monthlyRate: Number(values.monthlyRate),
    notes: values.notes?.trim() || null,
  }
}

export function BoardingContractForm({ action }: { action: 'create' | 'edit' }) {
  const { selectProps: clientSelectProps } = useSelect<Client>({
    resource: 'clients', optionLabel: clientName, optionValue: client => client.id,
    pagination: { mode: 'server', pageSize: 100 },
  })
  const { selectProps: horseSelectProps } = useSelect<Horse>({
    resource: 'horses', optionLabel: horse => horse.name, optionValue: horse => horse.id,
    pagination: { mode: 'off' },
  })
  const { query: stallsQuery } = useSelect<Stall>({
    resource: 'stalls', optionLabel: stall => stall.name, optionValue: stall => stall.id,
    pagination: { mode: 'off' },
  })
  const stallOptions = stallsQuery.data?.data.map(stall => ({
    value: stall.id,
    label: stall.isUnavailable ? `${stall.name} — недоступен` : stall.name,
    disabled: stall.isUnavailable,
  })) ?? []

  return <CatalogForm<BoardingContract, BoardingContractValues>
    resource="boarding-contracts"
    action={action}
    title={action === 'create' ? 'Новый договор постоя' : 'Редактирование договора постоя'}
    defaults={{ status: 'DRAFT', startsAt: dayjs(), monthlyRate: 0 }}
    toPayload={toPayload}
  >
    <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
      <Select {...clientSelectProps} showSearch optionFilterProp="label" placeholder="Выберите клиента" />
    </Form.Item>
    <Form.Item name="horseId" label="Лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}>
      <Select {...horseSelectProps} showSearch optionFilterProp="label" placeholder="Выберите лошадь" />
    </Form.Item>
    <Form.Item name="stallId" label="Денник">
      <Select allowClear showSearch optionFilterProp="label" options={stallOptions}
        loading={stallsQuery.isLoading} placeholder="Выберите денник" />
    </Form.Item>
    <Form.Item name="status" label="Статус" rules={[{ required: true, message: 'Выберите статус' }]}>
      <Select options={statusOptions} />
    </Form.Item>
    <Form.Item name="startsAt" label="Дата начала" getValueProps={dateValue}
      rules={[{ required: true, message: 'Укажите дату начала' }]}>
      <DatePicker showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="endsAt" label="Дата окончания" getValueProps={dateValue}>
      <DatePicker showTime format="DD.MM.YYYY HH:mm" allowClear style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="monthlyRate" label="Стоимость в месяц, ₽" rules={[
      { required: true, message: 'Укажите стоимость' },
      { type: 'number', min: 0, max: 9999999999.99, message: 'Укажите корректную стоимость' },
    ]} getValueProps={(value: unknown) => ({ value: value == null ? undefined : Number(value) })}>
      <InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="notes" label="Заметки" rules={[{ max: 2000, message: 'Не более 2000 символов' }]}>
      <Input.TextArea rows={5} maxLength={2000} showCount />
    </Form.Item>
  </CatalogForm>
}
