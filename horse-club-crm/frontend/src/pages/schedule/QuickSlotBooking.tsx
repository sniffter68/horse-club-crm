import { useRef, useState } from 'react'
import { Alert, App, Button, Form, Select, Space, Typography } from 'antd'
import { ClientSelectWithCreate } from '../../components/ClientSelectWithCreate'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import type { Arena, Horse, Trainer } from '../catalogs/types'
import { bookingFailure, type TriadValues } from './triad'
import { toInstant } from './time'
import { useScheduleConflicts } from './useScheduleConflicts'
import { useTriadAvailability } from './useTriadAvailability'

export function QuickSlotBooking({ initial, horses, trainers, arenas, onAdvanced, onSaved, report }: {
  initial: Partial<TriadValues>; horses: Horse[]; trainers: Trainer[]; arenas: Arena[];
  onAdvanced: (values: Partial<TriadValues>) => void; onSaved: () => void; report: (cause: unknown) => void;
}) {
  const [form] = Form.useForm<TriadValues>()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const lock = useRef(false)
  const { message } = App.useApp()
  const from = toInstant(initial.startTime!), to = toInstant(initial.endTime!)
  const restWindow = Math.max(0, ...horses.map(h => h.requiredRestMinutes ?? h.minRestMinutes)) * 60000
  const conflicts = useScheduleConflicts(new Date(+new Date(from) - restWindow).toISOString(), new Date(+new Date(to) + restWindow).toISOString())
  const availability = useTriadAvailability(from, to, 0, report)
  const minutes = (+new Date(to) - +new Date(from)) / 60000
  const freeHorses = horses.filter(h => {
    const load = availability.data?.horseWorkloads.find(w => w.horseId === h.id)
    const rest = (h.requiredRestMinutes ?? h.minRestMinutes) * 60000
    return !h.isUnavailable && (!h.status || h.status === 'active') && (!h.healthStatus || h.healthStatus === 'HEALTHY') && load && load.status !== 'UNAVAILABLE'
      && load.currentWorkloadMinutes + minutes <= load.maxDailyWorkloadMinutes
      && !conflicts.entries.some(e => e.horses.some(own => own.id === h.id) && +new Date(e.startTime) < +new Date(to) + rest && +new Date(e.endTime) + rest > +new Date(from))
  })
  const unavailable = conflicts.loading || availability.loading || Boolean(conflicts.error || availability.error)
  async function save(values: TriadValues) {
    if (lock.current || unavailable) return
    if (![values.clientId, values.horseId, values.trainerId, values.arenaId].every(isUuid)) { setFailure('Выберите клиента и доступные ресурсы'); return }
    if (!freeHorses.some(h => h.id === values.horseId)) { setFailure('Лошадь недоступна на выбранный интервал'); return }
    lock.current = true; setBusy(true); setFailure(undefined)
    try {
      await httpClient.post(`${API_URL}/bookings`, { ...values, startTime: from, endTime: to })
      void message.success('Бронирование создано'); onSaved()
    } catch (cause) { setFailure(bookingFailure(toHttpError(cause)).message); if (toHttpError(cause).statusCode === 401) report(cause) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div style={{ width: 'min(300px, calc(100vw - 48px))', maxHeight: 'calc(100dvh - 64px)', overflowY: 'auto' }}>
    <Typography.Paragraph>Быстрая запись · {initial.startTime?.slice(11)}–{initial.endTime?.slice(11)}</Typography.Paragraph>
    {(failure || conflicts.error || availability.error) && <Alert type="error" showIcon message={failure || conflicts.error || availability.error} />}
    <Form name="quick-slot" form={form} layout="vertical" noValidate disabled={busy} onFinish={save}
      initialValues={{ serviceType: 'dressage', costAmount: 0, ...initial, trainerId: initial.trainerId ?? (trainers.length === 1 ? trainers[0].id : undefined), arenaId: initial.arenaId ?? (arenas.length === 1 ? arenas[0].id : undefined) }}>
      <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}><ClientSelectWithCreate autoFocus /></Form.Item>
      <Form.Item name="horseId" label="Лошадь" rules={[{ required: true, message: 'Выберите свободную лошадь' }]}><Select aria-label="Лошадь" allowClear showSearch optionFilterProp="label" loading={unavailable} options={freeHorses.map(h => ({ value: h.id, label: h.name }))} notFoundContent={unavailable ? 'Загрузка…' : 'Нет свободных лошадей'} /></Form.Item>
      <Form.Item name="trainerId" label="Тренер" rules={[{ required: true, message: 'Выберите тренера' }]}><Select aria-label="Тренер" options={trainers.map(t => ({ value: t.id, label: t.fullName || t.name }))} disabled={busy || Boolean(initial.trainerId)} /></Form.Item>
      <Form.Item name="arenaId" label="Манеж" rules={[{ required: true, message: 'Выберите манеж' }]}><Select aria-label="Манеж" options={arenas.filter(a => !a.isUnavailable && a.isActive !== false).map(a => ({ value: a.id, label: a.name }))} disabled={busy || Boolean(initial.arenaId)} /></Form.Item>
      <Form.Item name="serviceType" hidden><Select /></Form.Item><Form.Item name="costAmount" hidden><Select /></Form.Item>
      <Typography.Paragraph type="secondary">Выездка · без оплаты. Услуга, стоимость и абонемент — в расширенных параметрах.</Typography.Paragraph>
      <Space wrap><Button type="primary" htmlType="submit" loading={busy} disabled={unavailable}>Записать</Button><Button type="link" disabled={busy} onClick={() => onAdvanced({ ...initial, ...form.getFieldsValue() })}>Расширенные параметры</Button></Space>
    </Form>
  </div>
}
