import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Select, Space, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { usePermissions } from '../../modulePermissions'
import { isUuid } from '../../uuid'
import { CashDeskPaymentModal } from '../cash-desk/CashDeskPaymentModal'
import { MembershipCreate } from '../memberships/create'
import type { ClientWithMemberships, Lesson, MembershipSummary } from './types'
import { lessonBalance } from './lessonPaymentSummary'

export function LessonDeferredPayment({ lesson, onSaved, onBusyChange }: { lesson: Lesson; onSaved: (lesson: Lesson) => void; onBusyChange: (busy: boolean) => void }) {
  const access = usePermissions()
  const { message } = App.useApp()
  const [cashOpen, setCashOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [selected, setSelected] = useState<string>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState<string>()
  useEffect(() => { onBusyChange(busy || cashOpen || saleOpen) }, [busy, cashOpen, saleOpen, onBusyChange])
  useEffect(() => () => onBusyChange(false), [onBusyChange])
  const booking = lesson.bookings[0]
  const eligible = lesson.paymentStatus === 'UNPAID' && lesson.bookings.length === 1 && lesson.service.allowMembership && lesson.pricePerPerson == null
  const canSell = !access.isEnabled('CASHBOX') || access.canWrite('CASHBOX')
  if (!access.canWrite('SCHEDULE') || lesson.status === 'CANCELLED' || !booking || lessonBalance(lesson).remaining <= 0 || lesson.paymentStatus === 'PAID_BY_MEMBERSHIP') return null

  async function refresh() {
    try {
      if (!isUuid(lesson.id)) throw new Error('Некорректный идентификатор занятия')
      const { data } = await httpClient.get<Lesson>(`${API_URL}/lessons/${lesson.id}`)
      onSaved(data)
    } catch (cause) { setError(toHttpError(cause).message) }
  }
  async function chooseMembership() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(undefined); setChoosing(true)
    try {
      if (!isUuid(booking.client.id)) throw new Error('Некорректный идентификатор клиента')
      const { data } = await httpClient.get<ClientWithMemberships>(`${API_URL}/clients/${booking.client.id}`)
      const rows = data.memberships.filter(m => m.isActive && m.type !== 'deposit' && m.type !== 'boarding' && m.remainedLessons > 0)
      setMemberships(rows)
      setSelected(rows.length === 1 ? rows[0].id : undefined)
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { pending.current = false; setBusy(false) }
  }
  async function attach(membershipId: string, sold = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(undefined); setSelected(membershipId)
    try {
      if (!isUuid(lesson.id) || !isUuid(membershipId)) throw new Error('Выберите корректный абонемент')
      const { data } = await httpClient.post<Lesson>(`${API_URL}/lessons/${lesson.id}/pay-with-membership`, { membershipId })
      window.dispatchEvent(new Event('cash-desk-paid'))
      void message.success('Занятие оплачено абонементом')
      onSaved(data)
    } catch (cause) { setError(`${sold ? 'Абонемент продан. Привязка не завершена; повторите списание выбранного абонемента. ' : ''}${toHttpError(cause).message}`) }
    finally { pending.current = false; setBusy(false) }
  }
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Alert type="warning" showIcon message="Занятие не оплачено" description="Примите оплату или спишите занятие с абонемента." />
    {error && <Alert role="alert" type="error" showIcon message={error} />}
    <Space wrap>
      {access.canWrite('CASHBOX') && <Button disabled={busy} onClick={() => setCashOpen(true)}>Принять оплату в кассу</Button>}
      {eligible && <Button loading={busy} onClick={() => void chooseMembership()}>Списать с абонемента</Button>}
      {eligible && canSell && <Button disabled={busy} onClick={() => setSaleOpen(true)}>Продать абонемент и привязать</Button>}
    </Space>
    {choosing && <Space direction="vertical" style={{ width: '100%' }}>
      {!busy && !memberships.length && !error && <Typography.Text type="secondary">У клиента нет активных абонементов с доступными занятиями.</Typography.Text>}
      <Select aria-label="Абонемент для оплаты" style={{ width: '100%' }} loading={busy} disabled={busy} value={selected} placeholder="Выберите абонемент"
        options={memberships.map(m => ({ value: m.id, label: `${m.title || m.pricingPlan?.name || 'Абонемент'} · Осталось: ${m.remainedLessons}` }))} onChange={setSelected} />
      <Button type="primary" loading={busy} disabled={!selected} onClick={() => { if (selected) void attach(selected) }}>Списать занятие</Button>
    </Space>}
    {cashOpen && <CashDeskPaymentModal initialClientId={booking.client.id} initialBookingId={booking.id} onClose={() => setCashOpen(false)} onPaid={() => void refresh()} />}
    {saleOpen && <MembershipCreate initialClientId={booking.client.id} initialServiceId={lesson.service.id} onClose={() => setSaleOpen(false)} onSold={membership => {
      setSaleOpen(false); setChoosing(true)
      setMemberships([membership])
      void attach(membership.id, true)
    }} />}
  </Space>
}
