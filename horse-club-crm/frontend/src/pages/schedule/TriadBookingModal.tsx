import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, DatePicker, Form, InputNumber, Modal, Select, Space, Spin, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/ru'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import type { Arena, Client, Horse, Trainer } from '../catalogs/types'
import type { ClientWithMemberships, MembershipSummary } from './types'
import { CLUB_TIME_ZONE, toInstant } from './time'
import { bookingFailure, clientName, disciplines, membershipBalance, type TriadBooking, type TriadValues } from './triad'
import { useTriadAvailability } from './useTriadAvailability'

const required = { required: true, message: 'Заполните поле' }
const dateBinding = { getValueProps: (value?: string) => ({ value: value ? dayjs(value) : null }), getValueFromEvent: (date: Dayjs | null) => date?.format('YYYY-MM-DDTHH:mm') }
const formatMinutes = (value: number) => Number(value.toFixed(1)).toLocaleString('ru-RU')
const stopPopupEscape = (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') event.stopPropagation() }

export function TriadBookingModal({ initial, booking, clients, horses, trainers, arenas, onClose, onSaved, report }: {
  initial: Partial<TriadValues>; booking?: TriadBooking; clients: Client[]; horses: Horse[]; trainers: Trainer[]; arenas: Arena[];
  onClose: () => void; onSaved: (start: string) => void; report: (cause: unknown) => void;
}) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<TriadValues>()
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [clientRevision, setClientRevision] = useState(0)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const clientId = Form.useWatch('clientId', form) as string | undefined
  const horseId = Form.useWatch('horseId', form) as string | undefined
  const arenaId = Form.useWatch('arenaId', form) as string | undefined
  const startTime = Form.useWatch('startTime', form) as string | undefined
  const endTime = Form.useWatch('endTime', form) as string | undefined
  const [membershipState, setMembershipState] = useState<{ clientId?: string; rows: MembershipSummary[]; loading: boolean; error?: string }>({ rows: [], loading: false })
  const memberships = membershipState.clientId === clientId ? membershipState.rows : []
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      if (!clientId) { setMembershipState({ rows: [], loading: false }); return }
      setMembershipState({ clientId, rows: [], loading: true })
      try {
        const response = await httpClient.get<ClientWithMemberships>(`${API_URL}/clients/${clientId}`, { signal: controller.signal })
        if (!controller.signal.aborted) setMembershipState({ clientId, rows: response.data.memberships, loading: false })
      } catch (cause) {
        if (controller.signal.aborted) return
        const error = toHttpError(cause)
        setMembershipState({ clientId, rows: [], loading: false, error: error.message })
        if (error.statusCode === 401) report(cause)
      }
    })
    return () => controller.abort()
  }, [clientId, clientRevision, report])
  let from: string | undefined, to: string | undefined
  try { if (startTime && endTime) { from = toInstant(startTime); to = toInstant(endTime); if (from >= to) { from = undefined; to = undefined } } } catch { /* Inline date validation owns malformed intervals. */ }
  const availability = useTriadAvailability(from, to, revision, report, booking?.id)
  const client = clients.find(c => c.id === clientId)
  const horse = horses.find(h => h.id === horseId)
  const weight = client?.weightKg == null ? undefined : Number(client.weightKg)
  const overweight = Boolean(horse && weight !== undefined && weight > (horse.maxRiderWeight ?? 85))
  const workload = availability.data?.horseWorkloads.find(h => h.horseId === horseId)
  const occupancy = availability.data?.arenaOccupancy.find(a => a.arenaId === arenaId)
  const suitableMemberships = memberships.filter(m => membershipBalance(m).active || m.id === booking?.membershipId)

  function close() {
    if (lock.current) return
    if (!dirty) { onClose(); return }
    modal.confirm({ title: 'Закрыть бронирование без сохранения?', content: 'Введённые изменения будут потеряны.', okText: 'Закрыть без сохранения', cancelText: 'Продолжить заполнение', onOk: onClose })
  }
  async function save(values: TriadValues) {
    if (lock.current || overweight) return
    lock.current = true; setBusy(true); setFailure(undefined)
    try {
      const payload = { ...values, membershipId: values.membershipId || undefined, startTime: toInstant(values.startTime), endTime: toInstant(values.endTime) }
      if (booking) await httpClient.patch(`${API_URL}/bookings/${booking.id}`, payload)
      else await httpClient.post(`${API_URL}/bookings`, payload)
      if (!mounted.current) return
      void message.success(booking ? 'Бронирование сохранено' : 'Бронирование создано')
      onSaved(values.startTime)
    } catch (cause) {
      if (!mounted.current) return
      const error = toHttpError(cause), reason = bookingFailure(error)
      setFailure(reason.message)
      if (reason.field) { form.setFields([{ name: reason.field, errors: [reason.message] }]); form.scrollToField(reason.field, { focus: true, block: 'center' }) }
      void message.error({ key: 'triad-booking-failure', content: reason.message })
      if (error.statusCode === 401) report(cause)
      if (error.statusCode === 409) setRevision(r => r + 1)
    } finally { lock.current = false; if (mounted.current) setBusy(false) }
  }

  return <Modal open title={booking ? 'Редактирование бронирования' : 'Бронирование тройного ресурса'} onCancel={close} footer={null}
    width={760} maskClosable={false} keyboard={!busy} className="triad-booking-modal">
    <Typography.Paragraph type="secondary">Лошадь, тренер и локация на один временной интервал. Время клуба: {CLUB_TIME_ZONE}.</Typography.Paragraph>
    {failure && <Alert type="error" showIcon message={failure} className="triad-feedback" />}
    <Form name="triad" form={form} noValidate layout="vertical" initialValues={{ serviceType: 'dressage', costAmount: 0, ...initial }} disabled={busy}
      onFinish={save} onFinishFailed={({ errorFields }) => { if (errorFields[0]) form.scrollToField(errorFields[0].name, { focus: true, block: 'center' }) }}
      onValuesChange={() => { setDirty(true); setFailure(undefined); form.setFields((['horseId', 'trainerId', 'arenaId', 'membershipId'] as const).map(name => ({ name, errors: [] }))) }}>
      <Form.Item name="clientId" label="Клиент" rules={[required]}>
        <Select onInputKeyDown={stopPopupEscape} id="triad_clientId" aria-label="Клиент" showSearch autoFocus optionFilterProp="label" allowClear placeholder="Имя или телефон" onChange={() => form.setFieldValue('membershipId', undefined)}
          options={clients.map(c => ({ value: c.id, label: `${clientName(c)} · ${c.phone || 'телефон не указан'} · ${c.weightKg == null ? 'вес не указан' : `${c.weightKg} кг`}${c.membership ? ` · ${c.membership.remainingUnits} / ${c.membership.totalUnits} занятий` : ''}` }))} />
      </Form.Item>
      {client && <div className="triad-client-summary" aria-live="polite">
        <strong>{clientName(client)}</strong><span>{client.phone || 'Телефон не указан'} · {weight === undefined ? 'Вес не указан — уточните перед тренировкой' : `${weight} кг`}</span>
        {membershipState.loading && <Spin size="small" />}
        {memberships.filter(m => membershipBalance(m).active).map(m => <span key={m.id}>{m.title || m.pricingPlan?.name || 'Абонемент'}: <b>{membershipBalance(m).label}</b></span>)}
        {!membershipState.loading && !membershipState.error && memberships.every(m => !membershipBalance(m).active) && <span>Нет активного абонемента или депозита</span>}
      </div>}
      {membershipState.error && <Alert type="error" showIcon message="Не удалось загрузить абонементы" description={membershipState.error}
        action={<Button onClick={() => setClientRevision(r => r + 1)}>Повторить</Button>} />}
      <div className="triad-form-grid">
        <Form.Item name="startTime" label="Начало" {...dateBinding} rules={[required, { validator: async (_, value: string) => { toInstant(value) } }]}>
          <DatePicker locale={ruDatePicker} onKeyDown={stopPopupEscape} popupClassName="triad-date-popup" showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" placeholder="Дата и время начала" />
        </Form.Item>
        <Form.Item name="endTime" label="Окончание" {...dateBinding} dependencies={['startTime']} rules={[required, { validator: async (_, value: string) => {
          const end = toInstant(value), start = toInstant(form.getFieldValue('startTime'))
          if (+new Date(end) <= +new Date(start)) throw new Error('Окончание должно быть позже начала')
        } }]}><DatePicker locale={ruDatePicker} onKeyDown={stopPopupEscape} popupClassName="triad-date-popup" showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" placeholder="Дата и время окончания" /></Form.Item>
      </div>
      <Form.Item name="horseId" label="Лошадь" rules={[required]} extra={horse ? `Допустимый вес: до ${horse.maxRiderWeight ?? 85} кг. Отдых между тренировками: ${horse.requiredRestMinutes ?? horse.minRestMinutes ?? 45} мин.` : undefined}>
        <Select onInputKeyDown={stopPopupEscape} id="triad_horseId" aria-label="Лошадь" showSearch allowClear optionFilterProp="label" placeholder="Выберите активную лошадь" loading={availability.loading} options={horses.filter(h => (!h.status || h.status === 'active') && !h.isUnavailable).map(h => {
          const load = availability.data?.horseWorkloads.find(w => w.horseId === h.id)
          const unsuitable = weight !== undefined && weight > (h.maxRiderWeight ?? 85)
          return { value: h.id, disabled: unsuitable, label: `${h.name} — ${load ? `${formatMinutes(load.currentWorkloadMinutes)} / ${load.maxDailyWorkloadMinutes} мин` : 'нагрузка уточняется'}${unsuitable ? ` · вес до ${h.maxRiderWeight ?? 85} кг` : ''}` }
        })} />
      </Form.Item>
      {overweight && <Alert className="horse-workload-warning" type="error" showIcon role="alert" message="Вес всадника превышает допустимый лимит для выбранной лошади. Выберите другую лошадь." />}
      {workload && <Typography.Paragraph className="triad-load" role="status">Нагрузка за {availability.data?.date?.split('-').reverse().join('.')}: {formatMinutes(workload.currentWorkloadMinutes)} / {workload.maxDailyWorkloadMinutes} мин</Typography.Paragraph>}
      <Form.Item name="trainerId" label="Тренер" rules={[required]}><Select onInputKeyDown={stopPopupEscape} id="triad_trainerId" aria-label="Тренер" showSearch allowClear optionFilterProp="label" placeholder="Выберите тренера"
        options={trainers.filter(t => t.isActive !== false).map(t => ({ value: t.id, label: `${t.fullName || t.name}${t.specializations?.length ? ` · ${t.specializations.join(', ')}` : t.qualification ? ` · ${t.qualification}` : ''}` }))} /></Form.Item>
      <Form.Item name="arenaId" label="Локация" rules={[required]}><Select onInputKeyDown={stopPopupEscape} id="triad_arenaId" aria-label="Локация" showSearch allowClear optionFilterProp="label" placeholder="Манеж, плац или маршрут" loading={availability.loading}
        options={arenas.filter(a => a.isActive !== false && !a.isUnavailable).map(a => {
          const row = availability.data?.arenaOccupancy.find(o => o.arenaId === a.id)
          return { value: a.id, label: `${a.name} (${row ? row.occupied : '…'}/${a.maxRidersCapacity ?? a.capacity} занято)` }
        })} /></Form.Item>
      {occupancy && occupancy.occupied >= occupancy.maxRidersCapacity && <Alert className="triad-feedback" type="warning" showIcon message="Локация заполнена на выбранное время. Выберите другую локацию или интервал." />}
      {availability.error && <Alert type="error" showIcon message="Не удалось проверить доступность ресурсов" description={availability.error}
        action={<Button onClick={() => setRevision(r => r + 1)}>Повторить проверку</Button>} />}
      <div className="triad-form-grid">
        <Form.Item name="serviceType" label="Дисциплина" rules={[required]}><Select onInputKeyDown={stopPopupEscape} id="triad_serviceType" aria-label="Дисциплина" options={Object.entries(disciplines).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="costAmount" label="Стоимость, ₽" rules={[required, { type: 'number', min: 0, max: 999999999999.99 }]}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
      </div>
      <Form.Item name="membershipId" label="Абонемент / депозит" extra="Бронирование фиксирует запись. Оплата и списание баланса выполняются отдельно.">
        <Select onInputKeyDown={stopPopupEscape} id="triad_membershipId" aria-label="Абонемент / депозит" allowClear showSearch optionFilterProp="label" disabled={!clientId || busy} loading={membershipState.loading} placeholder="Без абонемента"
          options={suitableMemberships.map(m => ({ value: m.id, label: `${m.title || m.pricingPlan?.name || 'Абонемент'} · ${membershipBalance(m).label}` }))} />
      </Form.Item>
      <Space wrap className="triad-actions"><Button type="primary" htmlType="submit" loading={busy} aria-busy={busy} disabled={overweight || availability.loading || Boolean(availability.error)}>{booking ? 'Сохранить бронирование' : 'Создать бронирование'}</Button>
        <Button disabled={busy} onClick={close}>Отмена</Button></Space>
    </Form>
  </Modal>
}
