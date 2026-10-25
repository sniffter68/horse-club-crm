import { useRef, useState, type ReactNode } from 'react'
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select as RefundSelect, Space, Spin, Typography } from 'antd'
import { useInvalidate } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../httpClient'
import { isUuid } from '../uuid'
import { usePermissions } from '../modulePermissions'
import { useCatalogPermissions } from '../pages/catalogs/permissions'

type Quote = { amount: string; refundMethod?: 'CASH' | 'BANK'; cancelled: boolean }
const CancelField = Form.Item
export function ServiceCancellationAction({ resource, id, label = 'Отменить услугу', description, disabled, onChanged, onBusyChange }: {
  resource: 'lessons' | 'memberships' | 'boarding-contracts'; id: string; label?: string; description?: ReactNode;
  disabled?: boolean; onChanged?: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { canManage } = useCatalogPermissions(resource)
  const access = usePermissions()
  const { message } = App.useApp()
  const invalidate = useInvalidate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<Quote>()
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const safeButton = useRef<HTMLButtonElement>(null)
  const [form] = Form.useForm<{ refund: boolean; refundMethod?: 'CASH' | 'BANK'; reason?: string }>()
  const refund = Form.useWatch('refund', form)
  const canRefund = !access.loading && !access.error && access.canWrite('CASHBOX')
  async function load() {
    if (lock.current || !canManage || disabled) return
    setOpen(true); setQuote(undefined); setError(undefined)
    if (!isUuid(id)) { setError('Некорректный идентификатор услуги'); return }
    lock.current = true; setBusy(true)
    try {
      const { data } = await httpClient.get<Quote>(`${API_URL}/${resource}/${id}/refund-quote`)
      setQuote(data); form.setFieldsValue({ refund: true, refundMethod: data.refundMethod, reason: '' })
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }
  async function commit() {
    if (lock.current || !canManage || !quote || quote.cancelled || !isUuid(id)) return
    let values
    try { values = await form.validateFields() } catch { return }
    if (lock.current) return
    if (Number(quote.amount) > 0 && values.refund && !canRefund) return
    lock.current = true; setBusy(true); setError(undefined); onBusyChange?.(true)
    try {
      await httpClient.post(`${API_URL}/${resource}/${id}/cancel`, { ...values, refund: Number(quote.amount) > 0 && values.refund })
      setOpen(false); void message.success('Услуга отменена. Кассовая история сохранена')
      for (const target of ['schedule', 'lessons', 'memberships', 'boarding-contracts', 'bookings', 'clients', 'horses', 'stalls', 'payments', 'cashbox-balance', 'cash-transactions', 'dashboard-stats', 'dashboard', 'kpi']) {
        void invalidate({ resource: target, invalidates: ['all'] }).catch(() => undefined)
      }
      window.dispatchEvent(new Event('cash-desk-paid'))
      window.dispatchEvent(new Event('lesson-deleted'))
      onChanged?.()
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false) }
  }
  if (!canManage) return null
  return <>
    <Button danger disabled={disabled || busy} onClick={() => void load()}>{label}</Button>
    <Modal open={open} title={`${label}?`} centered destroyOnHidden
      onCancel={() => { if (!lock.current) setOpen(false) }} closable={!busy} maskClosable={!busy} keyboard={!busy}
      afterOpenChange={visible => { if (visible) safeButton.current?.focus() }}
      footer={<Space wrap><Button ref={safeButton} disabled={busy} onClick={() => setOpen(false)}>Отмена</Button>
        {!quote && !busy && <Button onClick={() => void load()}>Повторить</Button>}
        <Button danger type="primary" loading={busy} disabled={!quote || quote.cancelled || (Number(quote.amount) > 0 && refund && !canRefund)} onClick={() => void commit()}>{label}</Button></Space>}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {description}
        <Typography.Paragraph>Услуга будет отменена. Платежи и история сохранятся.</Typography.Paragraph>
        {busy && !quote && <Spin aria-label="Расчёт возврата" />}
        {quote?.cancelled && <Alert type="info" message="Услуга уже отменена" />}
        <Form form={form} layout="vertical" noValidate style={{ width: '100%' }} disabled={busy}>
          {quote && Number(quote.amount) > 0 && <>
            <Typography.Paragraph strong>Сумма к возврату: {Number(quote.amount).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}</Typography.Paragraph>
            <CancelField name="refund" valuePropName="checked"><Checkbox>Оформить возврат в кассу</Checkbox></CancelField>
            {refund && <CancelField name="refundMethod" label="Способ возврата" rules={[{ required: true, message: 'Выберите способ возврата' }]}>
              <RefundSelect aria-label="Способ возврата" options={[{ value: 'CASH', label: 'Из наличной кассы' }, { value: 'BANK', label: 'С расчетного счета' }]} />
            </CancelField>}
            {!canRefund && <Alert type="warning" message="Для возврата требуется полный доступ к кассе" />}
            {!refund && <Alert type="warning" message="Средства будут удержаны клубом. Решение сохранится в журнале аудита" />}
          </>}
          {quote && <CancelField name="reason" label="Причина отмены/возврата" rules={[{ max: 300, message: 'Не более 300 символов' }]}>
            <Input.TextArea aria-label="Причина отмены/возврата" maxLength={300} autoSize={{ minRows: 2, maxRows: 5 }} style={{ resize: 'none' }} />
          </CancelField>}
        </Form>
        {error && <Alert role="alert" type="error" showIcon message="Не удалось отменить услугу" description={error} />}
      </Space>
    </Modal>
  </>
}
