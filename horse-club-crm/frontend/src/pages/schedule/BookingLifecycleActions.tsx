import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Select, Space, Typography } from 'antd'
import { useInvalidate } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isPenaltyCancellation, type TriadBooking } from './triad'

interface CancellationValues { cancelledBy: 'client' | 'club'; reason: string }

export function BookingLifecycleActions({ booking, report, onSaved, onBusyChange }: {
  booking: TriadBooking; report: (cause: unknown) => void; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const { message } = App.useApp()
  const invalidate = useInvalidate()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(Date.now)
  const [form] = Form.useForm<CancellationValues>()
  const initiator = Form.useWatch('cancelledBy', form) as CancellationValues['cancelledBy'] | undefined
  const lock = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!cancelOpen) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cancelOpen])
  if (booking.status !== 'scheduled') return null
  const billing = `С абонемента на занятия спишется 1 занятие, с депозита — ${Number(booking.costAmount).toLocaleString('ru-RU')} ₽. Если абонемент не выбран, используется подходящий с ближайшим сроком действия.`
  async function apply(action: 'complete' | 'no-show' | 'cancel', values?: CancellationValues) {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusyChange(true); setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/bookings/${booking.id}/${action}`, values)
      if (!mounted.current) return
      void message.success(action === 'complete' ? 'Тренировка завершена, списание записано' : action === 'no-show' ? 'Неявка и списание записаны' : 'Отмена записана')
      for (const resource of ['clients', 'memberships', `clients/${booking.clientId}/membership-ledger`]) void invalidate({ resource, invalidates: ['all'] })
      setCancelOpen(false); onSaved()
    } catch (cause) {
      if (!mounted.current) return
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) report(cause)
    } finally { lock.current = false; if (mounted.current) { setBusy(false); onBusyChange(false) } }
  }
  return <section className="booking-lifecycle" aria-label="Исход тренировки">
    {error && <Alert type="error" role="alert" showIcon message="Не удалось изменить статус" description={error} />}
    <Space wrap>
      <Popconfirm title="Завершить тренировку и списать занятие?" description={<span className="booking-billing-note">{billing}</span>}
        okText="Завершить и списать" cancelText="Назад" disabled={busy} onConfirm={() => apply('complete')} okButtonProps={{ loading: busy }}>
        <Button type="primary" disabled={busy}>Завершить</Button>
      </Popconfirm>
      <Popconfirm title="Зафиксировать неявку со списанием?" description={<span className="booking-billing-note">{billing}</span>}
        okText="Зафиксировать неявку" cancelText="Назад" disabled={busy} onConfirm={() => apply('no-show')} okButtonProps={{ loading: busy }}>
        <Button disabled={busy}>Неявка (No-show)</Button>
      </Popconfirm>
      <Button disabled={busy} onClick={() => { setNow(Date.now()); setCancelOpen(true) }}>Отменить</Button>
    </Space>
    <Modal className="booking-cancellation-modal" open={cancelOpen} title="Отмена бронирования" footer={null} maskClosable={false} keyboard={!busy}
      onCancel={() => { if (!lock.current) setCancelOpen(false) }} destroyOnHidden>
      <Form name={`cancel-booking-${booking.id}`} form={form} noValidate layout="vertical" initialValues={{ cancelledBy: 'client', reason: '' }} disabled={busy}
        onFinish={values => apply('cancel', { ...values, reason: values.reason.trim() })}>
        <Form.Item name="cancelledBy" label="Инициатор отмены" rules={[{ required: true }]}>
          <Select aria-label="Инициатор отмены" options={[{ value: 'client', label: 'Клиент' }, { value: 'club', label: 'Клуб' }]} />
        </Form.Item>
        {initiator === 'client' && isPenaltyCancellation(booking.startTime, now)
          ? <Alert className="horse-workload-warning" type="warning" role="alert" showIcon message="Внимание: до тренировки менее 12 часов. Будет применено штрафное списание занятия" description={billing} />
          : <Typography.Paragraph type="secondary">{initiator === 'club' ? 'Списания не будет. Привязанный абонемент продлится на 7 дней.' : 'Отмена за 12 часов и более — без списания. Правило проверяется в момент отмены.'}</Typography.Paragraph>}
        <Form.Item name="reason" label="Причина отмены" rules={[{ required: true, whitespace: true, message: 'Укажите причину отмены' }, { max: 1000, message: 'Не более 1000 символов' }]}>
          <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Например: изменение планов клиента" />
        </Form.Item>
        {error && <Alert type="error" role="alert" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Space wrap><Button type="primary" htmlType="submit" loading={busy} aria-busy={busy}>Подтвердить отмену</Button>
          <Button disabled={busy} onClick={() => setCancelOpen(false)}>Назад</Button></Space>
      </Form>
    </Modal>
  </section>
}
