import { useEffect } from 'react'
import { Create, Edit, useForm, useSelect } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Alert, DatePicker, Form, Input, InputNumber, Result, Select, Spin } from 'antd'
import dayjs from 'dayjs'
import type { Client } from '../catalogs/types'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { BoardingContract } from '../boarding-contracts/types'
import type { BookingPaymentOption, Payment, PaymentMethod, PaymentStatus, PaymentValues } from './types'

const methodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Наличные' }, { value: 'CARD', label: 'Карта' }, { value: 'TRANSFER', label: 'Перевод' },
]
const statusOptions: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'PENDING', label: 'Ожидается' }, { value: 'PAID', label: 'Оплачен' },
  { value: 'REFUNDED', label: 'Возвращён' }, { value: 'CANCELLED', label: 'Отменён' },
]
function personName(person: { name?: string; firstName?: string; lastName?: string }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.name || 'Без имени'
}
function dateValue(value: unknown) { return { value: value ? dayjs(String(value)) : undefined } }

export function PaymentForm({ action }: { action: 'create' | 'edit' }) {
  const { canManage, isLoading } = useCatalogPermissions()
  const { formProps, saveButtonProps, formLoading, query } = useForm<Payment, HttpError, PaymentValues>({
    resource: 'payments', action, redirect: 'list',
  })
  const form = formProps.form
  const { selectProps: clientSelectProps } = useSelect<Client>({
    resource: 'clients', optionLabel: personName, optionValue: client => client.id,
    pagination: { mode: 'server', pageSize: 100 },
  })
  const { query: contractsQuery } = useSelect<BoardingContract>({
    resource: 'boarding-contracts', optionLabel: contract => `${contract.horse.name} — ${personName(contract.client)}`,
    optionValue: contract => contract.id, pagination: { mode: 'off' },
  })
  const { query: bookingsQuery } = useSelect<BookingPaymentOption>({
    resource: 'payments/booking-options', optionLabel: booking => booking.id, optionValue: booking => booking.id,
    pagination: { mode: 'off' },
  })
  const contractId = Form.useWatch('boardingContractId', form)
  const bookingId = Form.useWatch('bookingId', form)
  const selectedContract = contractsQuery.data?.data.find(contract => contract.id === contractId)
  const selectedBooking = bookingsQuery.data?.data.find(booking => booking.id === bookingId)

  useEffect(() => {
    if (selectedContract) form?.setFieldsValue({ clientId: selectedContract.clientId, amount: Number(selectedContract.monthlyRate) })
  }, [form, selectedContract])
  useEffect(() => {
    if (selectedBooking) form?.setFieldsValue({ clientId: selectedBooking.clientId, amount: Number(selectedBooking.lesson.service.price) })
  }, [form, selectedBooking])

  if (isLoading) return <Spin />
  if (!canManage) return <Result status="403" title="Нет доступа" />
  const Wrapper = action === 'create' ? Create : Edit
  const contractOptions = contractsQuery.data?.data.map(contract => ({
    value: contract.id,
    label: `${contract.horse.name} · ${personName(contract.client)} · ${Number(contract.monthlyRate).toLocaleString('ru-RU')} ₽/мес.`,
  })) ?? []
  const bookingOptions = bookingsQuery.data?.data.map(booking => ({
    value: booking.id,
    label: `${dayjs(booking.lesson.startTime).format('DD.MM.YYYY HH:mm')} · ${booking.lesson.service.title || booking.lesson.service.name} · ${personName(booking.client)}`,
  })) ?? []

  return <Wrapper title={action === 'create' ? 'Новый платёж' : 'Редактирование платежа'}
    isLoading={formLoading} canDelete={false} saveButtonProps={{ ...saveButtonProps, children: 'Сохранить' }}>
    <Alert type="info" showIcon message="Внутренний реестр"
      description="Запись не формирует кассовый чек и не передаётся в бухгалтерию или онлайн-кассу." style={{ marginBottom: 24 }} />
    {query?.error ? <Alert type="error" showIcon message="Не удалось загрузить платёж" description={query.error.message} /> :
      <Form<PaymentValues> {...formProps} layout="vertical" style={{ maxWidth: 760 }}
        initialValues={action === 'create' ? { method: 'TRANSFER', status: 'PAID' } : formProps.initialValues}
        onFinish={values => formProps.onFinish?.({
          ...values,
          bookingId: values.bookingId || null,
          boardingContractId: values.boardingContractId || null,
          amount: values.amount === undefined ? undefined : Number(values.amount),
          paidAt: values.paidAt ? dayjs(values.paidAt).toISOString() : null,
          description: values.description?.trim() || null,
        })}>
        <Form.Item name="boardingContractId" label="Договор постоя">
          <Select allowClear showSearch optionFilterProp="label" options={contractOptions} loading={contractsQuery.isLoading}
            placeholder="Не выбран" onChange={() => form?.setFieldValue('bookingId', null)} />
        </Form.Item>
        <Form.Item name="bookingId" label="Запись на занятие">
          <Select allowClear showSearch optionFilterProp="label" options={bookingOptions} loading={bookingsQuery.isLoading}
            placeholder="Не выбрана" onChange={() => form?.setFieldValue('boardingContractId', null)} />
        </Form.Item>
        <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
          <Select {...clientSelectProps} showSearch optionFilterProp="label" placeholder="Выберите клиента" />
        </Form.Item>
        <Form.Item name="amount" label="Сумма, ₽" rules={[{ required: true, message: 'Укажите сумму' }, { type: 'number', min: 0.01 }]}>
          <InputNumber min={0.01} max={9999999999.99} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="method" label="Способ оплаты" rules={[{ required: true }]}><Select options={methodOptions} /></Form.Item>
        <Form.Item name="status" label="Статус" rules={[{ required: true }]}><Select options={statusOptions} /></Form.Item>
        <Form.Item name="paidAt" label="Дата оплаты" getValueProps={dateValue}>
          <DatePicker showTime format="DD.MM.YYYY HH:mm" allowClear style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Комментарий" rules={[{ max: 500 }]}>
          <Input.TextArea rows={4} maxLength={500} showCount />
        </Form.Item>
      </Form>}
  </Wrapper>
}
