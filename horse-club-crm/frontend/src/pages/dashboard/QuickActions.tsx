import { ClientSelectWithCreate } from '../../components/ClientSelectWithCreate'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Form, InputNumber, Select, Spin, Typography } from 'antd'
import { CalendarOutlined, ClockCircleOutlined, HomeOutlined, MedicineBoxOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { DateTime } from 'luxon'
import { usePermissions } from '../../modulePermissions'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { EntryOverlay } from '../../components/EntryOverlay'
import { StableEntryModal } from '../stable/shared'
import { CashDeskPaymentModal } from '../cash-desk/CashDeskPaymentModal'
import { ExpenseModal } from '../cash-desk/expenses'
import { QuickPlacement } from '../boarding-contracts/quick'
import { VetEntry } from '../stable/vet'
import { ShiftModal } from '../staff/forms'
import type { Staff, Shift } from '../staff/types'
import { useLeadLessonCatalogs } from './useLeadLessonCatalogs'
import { useTriadAvailability } from '../schedule/useTriadAvailability'
import { toInstant } from '../schedule/time'

const stopPopupEscape = (event: { key: string; stopPropagation: () => void }) => { if (event.key === 'Escape') event.stopPropagation() }

type LessonValues = { clientId: string; horseId: string; trainerId: string; serviceId: string; arenaId?: string; startTime: Dayjs; durationMinutes: number }

function LessonDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<LessonValues>()
  const [revision, retry] = useState(0)
  const [failure, setFailure] = useState<string>()
  const report = useCallback((cause: unknown) => setFailure(toHttpError(cause).message), [])
  const catalogs = useLeadLessonCatalogs(true, revision, report)
  const start = Form.useWatch('startTime', form) as Dayjs | undefined
  const duration = Form.useWatch('durationMinutes', form) as number | undefined
  const horseId = Form.useWatch('horseId', form) as string | undefined
  let from: string | undefined, to: string | undefined
  try {
    if (start?.isValid() && duration && duration > 0) {
      from = toInstant(start.format('YYYY-MM-DDTHH:mm'))
      to = new Date(+new Date(from) + duration * 60000).toISOString()
    }
  } catch { /* Invalid input is handled by the form. */ }
  const availability = useTriadAvailability(from, to, revision, report)
  const blockedHorse = (id: string) => {
    const load = availability.data?.horseWorkloads.find(row => row.horseId === id)
    const horse = catalogs.horses.find(row => row.id === id)
    return !load || load.status !== 'AVAILABLE' || load.currentWorkloadMinutes + (duration ?? 0) > load.maxDailyWorkloadMinutes
      || Boolean(horse?.healthStatus && horse.healthStatus !== 'HEALTHY')
  }
  const unavailable = catalogs.loading || catalogs.error || availability.loading || availability.error || !availability.data || !from || (horseId && blockedHorse(horseId))
  const required = [{ required: true, message: 'Заполните поле' }]
  return <StableEntryModal variant="drawer" title="Записать на тренировку" form={form} submitLabel="Записать на тренировку" submitDisabled={Boolean(unavailable)}
    resources={['lessons', 'bookings', 'horses']} successMessage="Тренировка назначена" onClose={onClose} onSaved={onSaved}
    save={async values => {
      if (unavailable) throw new Error('Проверьте доступность лошади и загрузку справочников')
      await httpClient.post(`${API_URL}/lessons`, { ...values, startTime: toInstant(values.startTime.format('YYYY-MM-DDTHH:mm')) })
    }}>
    <Typography.Paragraph type="secondary">Время Москвы. Проверяем здоровье, дневную нагрузку и занятость ресурсов.</Typography.Paragraph>
    {(failure || catalogs.error || availability.error) && <Alert type="error" showIcon message={failure || catalogs.error || availability.error || 'Не удалось загрузить клиентов'}
      action={<Button onClick={() => { retry(n => n + 1) }}>Повторить</Button>} />}
    <Form.Item name="clientId" label="Клиент" rules={required}><ClientSelectWithCreate aria-label="Клиент" showSearch allowClear placeholder="Имя или телефон" /></Form.Item>
    <Form.Item name="startTime" label="Дата и время (Москва)" initialValue={dayjs(DateTime.now().setZone('Europe/Moscow').startOf('hour').plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm"))} rules={required}>
      <DatePicker onKeyDown={stopPopupEscape} locale={ruDatePicker} classNames={{ popup: { root: 'triad-date-popup' } }} showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="serviceId" label="Услуга" rules={required}><Select onInputKeyDown={stopPopupEscape} aria-label="Услуга" loading={catalogs.loading} showSearch optionFilterProp="label"
      options={catalogs.services.map(row => ({ value: row.id, label: row.title || row.name }))}
      onChange={id => form.setFieldValue('durationMinutes', catalogs.services.find(row => row.id === id)?.durationMinutes ?? 60)} /></Form.Item>
    <Form.Item name="durationMinutes" label="Длительность, мин" initialValue={60} rules={[...required, { type: 'number', min: 1, max: 480 }]}><InputNumber min={1} max={480} precision={0} /></Form.Item>
    <Form.Item name="trainerId" label="Тренер" rules={required}><Select onInputKeyDown={stopPopupEscape} aria-label="Тренер" loading={catalogs.loading} showSearch optionFilterProp="label"
      options={catalogs.trainers.map(row => ({ value: row.id, label: row.fullName || row.name }))} /></Form.Item>
    <Form.Item name="horseId" label="Лошадь" rules={required}><Select onInputKeyDown={stopPopupEscape} aria-label="Лошадь" loading={catalogs.loading || availability.loading} showSearch optionFilterProp="label"
      options={catalogs.horses.map(row => ({ value: row.id, label: row.name, disabled: !from || availability.loading || blockedHorse(row.id) }))} /></Form.Item>
    {horseId && blockedHorse(horseId) && <Alert type="warning" showIcon message="Лошадь недоступна или превышен дневной лимит. Выберите другую лошадь или время." />}
    <Form.Item name="arenaId" label="Манеж / локация"><Select onInputKeyDown={stopPopupEscape} allowClear showSearch optionFilterProp="label" loading={catalogs.loading}
      options={catalogs.arenas.map(row => ({ value: row.id, label: row.name }))} /></Form.Item>
  </StableEntryModal>
}

function ShiftsDrawer({ shifts, onClose, onSaved }: { shifts: Shift[]; onClose: () => void; onSaved: () => void }) {
  const [staff, setStaff] = useState<Staff[]>()
  const [error, setError] = useState<string>()
  const [selected, select] = useState<Shift>()
  const [revision, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      const rows: Staff[] = []
      for (let page = 1; ; page++) {
        const { data } = await httpClient.get<{ data: Staff[]; total: number }>(`${API_URL}/staff`, { params: { page, pageSize: 100 }, signal: controller.signal })
        rows.push(...data.data)
        if (rows.length >= data.total || !data.data.length) break
      }
      if (!controller.signal.aborted) setStaff(rows)
    })().catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [revision])
  if (!staff) return <EntryOverlay variant="drawer" open title="Открыть / закрыть смену" onCancel={onClose} footer={null}>
    {error ? <Alert type="error" message={error} action={<Button onClick={() => { setError(undefined); retry(n => n + 1) }}>Повторить</Button>} /> : <Spin aria-label="Загрузка сотрудников" />}
  </EntryOverlay>
  return <ShiftModal key={selected?.id ?? 'new'} variant="drawer" staff={staff} shift={selected} selectedDate={DateTime.now().setZone('Europe/Moscow').toISODate()!} onClose={onClose} onSaved={onSaved}
    leading={<Form.Item label="Открыть новую или изменить смену"><Select onInputKeyDown={stopPopupEscape} aria-label="Выбрать смену" placeholder="Новая смена" allowClear value={selected?.id}
      options={shifts.map(row => ({ value: row.id, label: `${staff.find(person => person.id === row.staffId)?.fullName ?? row.staffId} · ${row.startTime}–${row.endTime}` }))} onChange={id => select(shifts.find(row => row.id === id))} /></Form.Item>} />

}

export function QuickActions({ onSaved, shifts }: { onSaved: () => void; shifts: Shift[] }) {
  const permissions = usePermissions()
  const [action, setAction] = useState<string>()
  const close = () => setAction(undefined)
  const saved = () => { close(); onSaved() }
  return <>
    <section aria-label="Быстрые действия" className="dashboard-quick-actions">
      {permissions.canWrite('SCHEDULE') && <Button type="primary" icon={<CalendarOutlined aria-hidden />} onClick={() => setAction('lesson')}>+ Записать на тренировку</Button>}
      {permissions.canWrite('CASHBOX') && <>
        <Button className="quick-action-success" icon={<PlusOutlined aria-hidden />} onClick={() => setAction('payment')}>+ Принять оплату</Button>
        <Button className="quick-action-warning" icon={<MinusOutlined aria-hidden />} onClick={() => setAction('expense')}>− Внести расход</Button>
      </>}
      {permissions.canWrite('STABLES') && <Button className="quick-action-info" icon={<HomeOutlined aria-hidden />} onClick={() => setAction('boarding')}>+ Заселить лошадь</Button>}
      {permissions.canWrite('VETERINARY') && <Button className="quick-action-vet" icon={<MedicineBoxOutlined aria-hidden />} onClick={() => setAction('vet')}>Ветпроцедура</Button>}
      {permissions.canWrite('STAFF_PAYROLL') && <Button icon={<ClockCircleOutlined aria-hidden />} onClick={() => setAction('shift')}>Открыть / закрыть смену</Button>}
    </section>
    {action === 'lesson' && permissions.canWrite('SCHEDULE') && <LessonDrawer onClose={close} onSaved={saved} />}
    {action === 'payment' && permissions.canWrite('CASHBOX') && <CashDeskPaymentModal variant="drawer" onClose={close} />}
    {action === 'expense' && permissions.canWrite('CASHBOX') && <ExpenseModal variant="drawer" onClose={close} />}
    {action === 'boarding' && permissions.canWrite('STABLES') && <QuickPlacement variant="drawer" context={{ kind: 'DASHBOARD', id: '', name: 'Клуб' }} onClose={close} onSaved={onSaved} />}
    {action === 'vet' && permissions.canWrite('VETERINARY') && <VetEntry variant="drawer" onClose={close} onSaved={saved} />}
    {action === 'shift' && permissions.canWrite('STAFF_PAYROLL') && <ShiftsDrawer shifts={shifts} onClose={close} onSaved={saved} />}
  </>
}
