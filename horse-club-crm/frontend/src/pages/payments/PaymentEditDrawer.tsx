import { useState } from 'react'
import { DatePicker, Form, Input, InputNumber, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient } from '../../httpClient'
import { isUuid } from '../../uuid'
import { StableEntryModal } from '../stable/shared'
import { toLocalInput, toInstant } from '../schedule/time'
import type { Payment, PaymentMethod } from './types'
import { paymentMethods } from './methods'
export function PaymentEditDrawer({ payment, onClose, onSaved }: { payment: Payment; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ method: PaymentMethod; amount: number; paidAt: Dayjs; description?: string }>()
  const [initial] = useState(() => ({ method: payment.method, amount: Number(payment.amount),
    paidAt: dayjs(toLocalInput(new Date(payment.paidAt || payment.createdAt))), description: payment.description || '' }))
  return <StableEntryModal variant="drawer" title="Изменить оплату" form={form} initialValues={initial} submitLabel="Сохранить изменения"
    resources={['payments', 'clients', 'memberships', 'lessons']} onClose={onClose} onSaved={() => { window.dispatchEvent(new Event('cash-desk-paid')); onSaved() }}
    save={values => {
      if (!isUuid(payment.id)) throw new Error('Некорректный идентификатор оплаты')
      const date = values.paidAt.format('YYYY-MM-DDTHH:mm')
      const paidAt = date === initial.paidAt.format('YYYY-MM-DDTHH:mm') ? payment.paidAt || payment.createdAt : toInstant(date)
      return httpClient.patch(`${API_URL}/payments/${payment.id}`, { ...values, paidAt })
    }}>
    <Form.Item name="method" label="Способ оплаты" rules={[{ required: true, message: 'Выберите способ оплаты' }]}><Select options={paymentMethods} /></Form.Item>
    <Form.Item name="amount" label="Сумма, ₽" rules={[{ required: true, type: 'number', min: 0.01, max: 9999999999.99, message: 'Укажите положительную сумму' }]}><InputNumber min={0.01} precision={2} style={{ width: '100%' }} /></Form.Item>
    <Form.Item name="paidAt" label="Дата и время оплаты (Москва)" rules={[{ required: true, message: 'Укажите дату оплаты' }]}><DatePicker locale={ruDatePicker} showTime format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} /></Form.Item>
    <Form.Item name="description" label="Комментарий" rules={[{ max: 500 }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={500} style={{ resize: 'none' }} /></Form.Item>
  </StableEntryModal>
}
