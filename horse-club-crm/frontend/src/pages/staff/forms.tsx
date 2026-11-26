import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Checkbox, Switch, TimePicker, Typography, Space } from 'antd'
import { DateTime } from 'luxon'
import { intervalHours, type WeekDay } from './weekTemplates'
import { WeekPreview } from './WeekPreview'
import type { PageData } from './types'
import { plannedKind, shiftLabel } from './types'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { StableEntryModal } from '../stable/shared'
import { currency } from '../cash-desk/shared'
import { paidPeriodFor, shiftStatuses, type PaidPeriod, type Payroll, type Shift, type ShiftStatus, type Staff } from './types'
import { TelegramProfileLink } from '../../components/TelegramProfileLink'
import { VkProfileField, VkProfileLink } from '../../components/VkProfileLink'
import { PhoneField } from '../../components/PhoneField'
import { phonePayload } from '../../components/formatPhone'
import { useList, usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { staffRoles } from './types'
import { isUuid } from '../../uuid'
import { getIdentity } from '../../authStorage'
import { ToggleSettingRow } from '../../components/ToggleSettingRow'
import { CrmAccessToggle } from './CrmAccessToggle'
import { trainerServiceSettings, type TrainerDirections } from './specialization'
import type { Trainer } from '../catalogs/types'

type StaffTrainer = Trainer & { payScheme?: 'LEGACY' | 'PERCENT' | 'FIXED' | 'CLUB'; fixedPay?: string | number }

type ProfileValues = TrainerDirections & { isPublic?: boolean; imageUrl?: string | null; description?: string | null; payScheme?: 'LEGACY' | 'PERCENT' | 'FIXED' | 'CLUB'; commissionPercent?: number; fixedPay?: number; userId?: string; trainerId?: string; role: Role; fullName: string; roleTitle?: string; email?: string; vkId?: string; phone?: string; temporaryPassword?: string; createCrmAccess?: boolean; isActive: boolean; scheduleColor?: string; shiftRate?: number; lessonRate?: number; groupLessonRate?: number }

const required = [{ required: true, message: 'Заполните поле' }]
const moneyProps = { min: 0, max: 9999999999.99, precision: 2, style: { width: '100%' } }

export function ProfileModal({ staff, onClose, onSaved, onTelegramChanged }: { staff?: Staff; onClose: () => void; onSaved: () => void; onTelegramChanged?: () => void }) {
  const [form] = Form.useForm<ProfileValues>()
  const { data: role } = usePermissions<Role>({})
  const access = Form.useWatch('createCrmAccess', form)
  const linkedUser = Form.useWatch('userId', form)
  const staffRole = Form.useWatch('role', form)
  const payScheme = Form.useWatch('payScheme', form)
  const { result: trainers } = useList<StaffTrainer>({ resource: 'trainers', pagination: { pageSize: 200 }, queryOptions: { enabled: staffRole === 'TRAINER' && !staff?.user?.trainerId } })
  const [candidates, setCandidates] = useState<Array<{ id: string; role?: string; email: string; crmAccess?: boolean; vkId?: string | null; trainer?: StaffTrainer }>>([])
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (staff) return
    const controller = new AbortController()
    void httpClient.get(`${API_URL}/staff/candidates`, { signal: controller.signal }).then(res => setCandidates(res.data)).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [staff])
  return <StableEntryModal variant="drawer" title={staff ? `Редактирование сотрудника: ${staff.fullName}` : 'Добавить сотрудника'} form={form} submitLabel="Сохранить" resources={['staff', 'trainers', 'schedule', 'dashboard-stats']} onClose={onClose} onSaved={onSaved} successMessage="Данные сотрудника обновлены"
    save={values => {
      if ((staff && !isUuid(staff.id)) || (values.userId && !isUuid(values.userId)) || (values.trainerId && !isUuid(values.trainerId))) throw new Error('Некорректный идентификатор сотрудника')
      const payload = { ...values, vkId: values.vkId?.trim() || null, phone: phonePayload(values.phone) }
      if (values.role !== 'TRAINER') {
        for (const { key } of trainerServiceSettings) delete payload[key]
        delete payload.trainerId; delete payload.isPublic; delete payload.imageUrl; delete payload.description
        delete payload.payScheme; delete payload.commissionPercent; delete payload.fixedPay
      } else {
        if (values.payScheme !== 'PERCENT') delete payload.commissionPercent
        if (values.payScheme !== 'FIXED') delete payload.fixedPay
        payload.imageUrl = values.imageUrl?.trim() || null
        payload.description = values.description?.trim() || null
      }
      if (!values.roleTitle?.trim()) delete payload.roleTitle
      if (!values.createCrmAccess) delete payload.temporaryPassword
      return staff ? httpClient.patch(`${API_URL}/staff/${staff.id}`, payload) : httpClient.post(`${API_URL}/staff`, payload)
    }}>
    {error && <Alert type="error" message={error} />}
    {!staff && <Form.Item name="userId" label="Существующая учетная запись (необязательно)"><Select allowClear aria-label="Учетная запись" showSearch optionFilterProp="label" options={candidates.map(user => ({ value: user.id, label: user.email }))} onChange={id => {
      const selected = candidates.find(user => user.id === id)
      form.setFieldsValue({ vkId: selected?.vkId || '', createCrmAccess: selected?.crmAccess ?? false, email: selected?.email.endsWith('@staff.invalid') ? undefined : selected?.email, temporaryPassword: undefined })
      form.setFieldValue('role', selected?.role ?? 'OTHER')
      const trainer = selected?.trainer
      if (trainer) form.setFieldsValue({ fullName: trainer.fullName || trainer.name, isPublic: trainer.isPublic,
        imageUrl: trainer.imageUrl, description: trainer.description, payScheme: trainer.payScheme ?? 'LEGACY',
        commissionPercent: Number(trainer.commissionPercent ?? 30), fixedPay: Number(trainer.fixedPay ?? 0) })
      for (const { key } of trainerServiceSettings) form.setFieldValue(key, trainer?.[key] ?? true)
    }} /></Form.Item>}
    <section aria-label="Основное"><Typography.Title level={5}>Основное</Typography.Title>
    <Form.Item name="fullName" label="ФИО" initialValue={staff?.fullName} rules={required}><Input aria-label="ФИО" maxLength={150} /></Form.Item>
    <Form.Item name="role" label="Роль" initialValue={staff?.user?.role ?? 'OTHER'} rules={required}><Select aria-label="Роль" options={Object.entries(staffRoles).filter(([value]) => role === 'ADMIN' || value !== 'ADMIN').map(([value, label]) => ({ value, label }))} /></Form.Item>
    <PhoneField initialValue={staff?.phone} />
    <Form.Item name="roleTitle" label="Должность" initialValue={staff?.roleTitle}><Input aria-label="Должность" maxLength={150} /></Form.Item>
    <Form.Item name="scheduleColor" label="Цвет в расписании" initialValue={staff?.scheduleColor} rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: 'Укажите цвет в формате #724C39' }]}><Input aria-label="Цвет в расписании" maxLength={7} placeholder="#724C39" /></Form.Item>
    </section>
    <section aria-label="Доступ и уведомления"><Typography.Title level={5}>Доступ и уведомления</Typography.Title>
    <>
      <Form.Item name="createCrmAccess" valuePropName="checked" initialValue={staff?.user?.crmAccess ?? false}><CrmAccessToggle name={staff?.fullName} self={!!staff?.user?.email && staff.user.email === getIdentity()?.email} disabled={staff?.isActive === false} /></Form.Item>
      <Form.Item name="email" label="Email" initialValue={staff?.user?.email?.endsWith('@staff.invalid') ? undefined : staff?.user?.email} rules={[{ type: 'email', message: 'Укажите корректный email' }, ...(access ? required : [])]}><Input aria-label="Email" autoComplete="off" /></Form.Item>
      {access && <Form.Item name="temporaryPassword" label="Временный пароль" rules={[...(!staff && !linkedUser || staff?.user?.email?.endsWith('@staff.invalid') || candidates.find(user => user.id === linkedUser)?.email.endsWith('@staff.invalid') ? required : []), { min: 8, message: 'Не менее 8 символов' }]}><Input.Password aria-label="Временный пароль" autoComplete="new-password" maxLength={72} /></Form.Item>}
    </>
    {staff && <VkProfileLink id={staff.userId} name={staff.fullName} vkId={staff.user?.vkId} kind="STAFF" readOnly />}
    {staff && <TelegramProfileLink id={staff.userId} name={staff.fullName} kind="user" role={staff.user?.role === 'ADMIN' ? 'admin' : staff.user?.role === 'TRAINER' ? 'trainer' : 'staff'} telegramUserId={staff.user?.telegramUserId} telegramUsername={staff.user?.telegramUsername} readOnly={staff.user?.role === 'ADMIN' && role !== 'ADMIN'} onChanged={onTelegramChanged} />}
    <VkProfileField initialValue={staff?.user?.vkId} />
    </section>
    {staffRole === 'TRAINER' && !staff?.user?.trainerId && trainers?.data.some(trainer => !trainer.user) && <Form.Item name="trainerId" label="Существующая карточка тренера" extra="Выберите тренера из расписания, чтобы сохранить занятия и начисления."><Select aria-label="Существующая карточка тренера" virtual={false} allowClear showSearch optionFilterProp="label" onChange={id => {
      const trainer = trainers?.data.find(row => row.id === id)
      if (trainer) form.setFieldsValue({ fullName: trainer.fullName || trainer.name, phone: trainer.phone ?? undefined,
        vkId: trainer.vkId ?? undefined, isPublic: trainer.isPublic, imageUrl: trainer.imageUrl, description: trainer.description,
        payScheme: trainer.payScheme ?? 'LEGACY', commissionPercent: Number(trainer.commissionPercent ?? 30), fixedPay: Number(trainer.fixedPay ?? 0) })
      for (const { key } of trainerServiceSettings) form.setFieldValue(key, trainer?.[key] ?? true)
    }} options={(trainers?.data ?? []).filter(trainer => !trainer.user).map(trainer => ({ value: trainer.id, label: `${trainer.name}${trainer.phone ? ` · ${trainer.phone}` : ''}` }))} /></Form.Item>}
    {staffRole === 'TRAINER' && <section className="staff-trainer-disclosure" aria-label="Направления и витрина">
      <Typography.Title level={5}>Направления и витрина</Typography.Title>
      {trainerServiceSettings.map(({ key, title }) => <Form.Item key={key} name={key} valuePropName="checked" initialValue={staff?.user?.trainer?.[key] ?? true}>
        <ToggleSettingRow title={title} description="Учитывается при назначении тренера в расписании. Несовпадение покажет предупреждение." />
      </Form.Item>)}
      <Form.Item name="isPublic" valuePropName="checked" initialValue={staff?.user?.trainer?.isPublic ?? false}><ToggleSettingRow title="Показывать на сайте и в записи ВК" description="Профиль доступен клиентам для выбора тренера." /></Form.Item>
      <Form.Item name="description" label="Короткое описание" initialValue={staff?.user?.trainer?.description}><Input.TextArea aria-label="Короткое описание" rows={3} maxLength={2000} style={{ resize: 'none' }} /></Form.Item>
      <Form.Item name="imageUrl" label="Фото (ссылка)" initialValue={staff?.user?.trainer?.imageUrl} rules={[{ type: 'url', message: 'Укажите ссылку на фото: https://…' }]}><Input aria-label="Фото (ссылка)" placeholder="https://…" maxLength={2000} /></Form.Item>
    </section>}
    {staffRole === 'TRAINER' && <section className="staff-trainer-disclosure" aria-label="Ставка и зарплата">
      <Typography.Title level={5}>Ставка и зарплата</Typography.Title>
      <Form.Item name="payScheme" label="Схема расчёта" initialValue={staff?.user?.trainer?.payScheme ?? (staff ? 'LEGACY' : 'CLUB')} rules={required}><Select aria-label="Схема расчёта" options={[
        { value: 'PERCENT', label: 'Процент от занятия' }, { value: 'FIXED', label: 'Фикс за занятие' }, { value: 'CLUB', label: 'Общая ставка клуба · 30%' },
        ...(staff || payScheme === 'LEGACY' ? [{ value: 'LEGACY', label: 'Действующая схема: процент и доплаты' }] : []),
      ]} /></Form.Item>
      {payScheme === 'PERCENT' && <Form.Item name="commissionPercent" label="Процент от занятия (%)" initialValue={Number(staff?.user?.trainer?.commissionPercent ?? 30)} rules={required}><InputNumber aria-label="Процент от занятия (%)" {...moneyProps} max={100} /></Form.Item>}
      {payScheme === 'FIXED' && <Form.Item name="fixedPay" label="Ставка за занятие (₽)" initialValue={Number(staff?.user?.trainer?.fixedPay ?? 0)} rules={required}><InputNumber aria-label="Ставка за занятие (₽)" {...moneyProps} /></Form.Item>}
      {payScheme === 'CLUB' && <Typography.Paragraph type="secondary">30% от стоимости услуги по прайсу за проведённое занятие.</Typography.Paragraph>}
      {payScheme !== 'LEGACY' && <Typography.Paragraph type="secondary">Выбранная схема заменяет прежний процент и доплаты за занятия. Ставка за смену начисляется отдельно. Оплаченные ведомости сохраняются.</Typography.Paragraph>}
    </section>}
    <Form.Item name="shiftRate" label="Ставка за смену (₽)" initialValue={staff?.shiftRate == null ? undefined : Number(staff.shiftRate)}><InputNumber aria-label="Ставка за смену (₽)" {...moneyProps} /></Form.Item>
    {(staffRole !== 'TRAINER' || payScheme === 'LEGACY') && <>
      {([['lessonRate', 'Индивидуальное занятие (₽)'], ['groupLessonRate', 'Групповое занятие (₽)']] as const).map(([name, label]) =>
        <Form.Item key={name} name={name} label={label} initialValue={staff?.[name] == null ? undefined : Number(staff[name])}><InputNumber {...moneyProps} /></Form.Item>)}
    </>}
    <Form.Item name="isActive" label="Активный сотрудник" valuePropName="checked" initialValue={staff?.isActive ?? true}><Switch /></Form.Item>
  </StableEntryModal>
}

export function ShiftModal({ variant = 'modal', leading, staff, shift, selectedDate, onClose, onSaved, onDelete }: { variant?: 'modal' | 'drawer'; leading?: ReactNode; staff: Staff[]; shift?: Shift; selectedDate: string; onClose: () => void; onSaved: () => void; onDelete?: (shift: Shift) => void }) {
  const [form] = Form.useForm<{ staffId: string; dates: Dayjs[]; times: [Dayjs, Dayjs]; status: ShiftStatus; notes?: string; force?: boolean }>()
  const { data: role } = usePermissions<Role>({})
  const selectedStaff = Form.useWatch('staffId', form) ?? staff.find(row => row.isActive)?.id
  const staffId = shift?.staffId ?? selectedStaff
  const force = Form.useWatch('force', form) === true && role === 'ADMIN'
  const [periodState, setPeriodState] = useState<{ staffId: string; periods: PaidPeriod[] }>()
  const [periodError, setPeriodError] = useState<string>()
  const times = Form.useWatch('times', form) as [Dayjs, Dayjs] | undefined
  const dates = Form.useWatch('dates', form) as Dayjs[] | undefined
  const [preview, setPreview] = useState<WeekDay[]>()
  const [previewError, setPreviewError] = useState<string>()
  const [previewBusy, setPreviewBusy] = useState(false)
  const previewController = useRef<AbortController | null>(null)
  useEffect(() => () => previewController.current?.abort(), [])
  const bulkInterval = async () => {
    if (!shift || !times?.[0] || !times[1] || !isUuid(shift.staffId)) return
    const startTime = times[0].format('HH:mm'), endTime = times[1].format('HH:mm')
    if (startTime >= endTime) { setPreviewError('Окончание смены должно быть позже начала'); return }
    setPreviewBusy(true); setPreviewError(undefined)
    previewController.current?.abort()
    const controller = new AbortController()
    previewController.current = controller
    try {
      const monday = DateTime.fromISO(shift.date.slice(0, 10), { zone: 'Europe/Moscow' }).startOf('week')
      const { data } = await httpClient.get<PageData<Shift>>(`${API_URL}/staff/shifts`, { params: { staffId: shift.staffId, from: monday.toISODate(), to: monday.plus({ days: 6 }).toISODate(), pageSize: 100 }, signal: controller.signal })
      const current = form.getFieldValue('times') as [Dayjs, Dayjs] | undefined
      if (!controller.signal.aborted && current?.[0]?.format('HH:mm') === startTime && current?.[1]?.format('HH:mm') === endTime) {
        setPreview(data.data.filter(row => row.status === 'SCHEDULED').map(row => ({ date: row.date.slice(0, 10), kind: 'WORK', startTime, endTime })))
        form.setFields([{ name: 'times', touched: true }])
      }
    } catch (cause) { if (!controller.signal.aborted) setPreviewError(toHttpError(cause).message) }
    finally { if (!controller.signal.aborted) setPreviewBusy(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    if (!staffId || !isUuid(staffId)) return
    void httpClient.get<PaidPeriod[]>(`${API_URL}/staff/${staffId}/paid-periods`, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) { setPeriodState({ staffId, periods: response.data }); setPeriodError(undefined) }
    }).catch(cause => { if (!controller.signal.aborted) setPeriodError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [staffId])
  const periodsReady = periodState?.staffId === staffId && !periodError
  const isClosed = (date: string) => !!paidPeriodFor(periodState?.periods ?? [], staffId ?? '', date)
  return <StableEntryModal variant={variant} title={shift ? 'Изменить смену' : 'Запланировать смену'} form={form} submitDisabled={previewBusy} submitLabel={shift ? 'Сохранить смену' : 'Запланировать смену'} resources={['staff']} onClose={onClose} onSaved={onSaved}
    save={values => {
      if (!isUuid(shift?.id ?? values.staffId)) throw new Error('Некорректный идентификатор сотрудника или смены')
      if (!periodsReady) throw new Error('Не удалось проверить закрытые периоды. Закройте форму и повторите попытку')
      if (preview) {
        if (!preview.length) throw new Error('В этой неделе нет запланированных рабочих дней')
        if (preview.some(day => isClosed(day.date))) throw new Error('План затрагивает оплаченный период')
        return httpClient.post(`${API_URL}/staff/shifts`, { staffId, days: preview })
      }
      if (!force && (shift ? isClosed(shift.date.slice(0, 10)) : values.dates.some(date => isClosed(date.format('YYYY-MM-DD'))))) throw new Error('Выберите даты вне оплаченных периодов или отмените оплату ведомости')
      const kind = shift ? plannedKind(shift) : undefined
      const payload = { startTime: values.times[0].format('HH:mm'), endTime: values.times[1].format('HH:mm'), notes: kind && values.status === 'ABSENT' ? `[plan:${kind}]${values.notes ? `\n${values.notes}` : ''}` : values.notes ?? (kind ? '' : undefined), ...(force ? { force: true } : {}) }
      if (payload.startTime >= payload.endTime) return Promise.reject(new Error('Окончание смены должно быть позже начала в тот же день'))
      return shift ? httpClient.patch(`${API_URL}/staff/shifts/${shift.id}`, { ...payload, status: values.status }) : httpClient.post(`${API_URL}/staff/shifts`, { ...payload, staffId: values.staffId, dates: values.dates.map(date => date.format('YYYY-MM-DD')) })
    }}>
    {leading}
    {previewError && <Alert type="error" message={previewError} />}
    <Space wrap style={{ marginBottom: 16 }}>{['09:00–18:00', '10:00–19:00', '10:00–21:00'].map(interval => <Button key={interval} onClick={() => { const [start, end] = interval.split('–'); form.setFieldValue('times', [dayjs(`2000-01-01T${start}`), dayjs(`2000-01-01T${end}`)]); setPreview(undefined) }}>{interval}</Button>)}
      <Button onClick={() => {
        const selected = shift ? [shift.date.slice(0, 10)] : (dates ?? []).map(date => date.format('YYYY-MM-DD'))
        if (!selected.length || selected.length > 7) { setPreviewError('Для выходных выберите от 1 до 7 дат'); return }
        setPreview(selected.map(date => ({ date, kind: 'OFF', startTime: shift?.startTime ?? '09:00', endTime: shift?.endTime ?? '18:00' })))
        form.setFields([{ name: 'times', touched: true }])
      }}>Выходной</Button>
    </Space>
    {periodError && <Alert showIcon type="error" message="Не удалось загрузить закрытые периоды" description={periodError} />}
    {role === 'ADMIN' && <Form.Item name="force" valuePropName="checked"><Checkbox>Подтверждаю корректировку закрытых дат: отменить оплату затронутых ведомостей и связанные расходы, вернуть ведомости в черновик</Checkbox></Form.Item>}
    {!shift && <><Form.Item name="staffId" label="Сотрудник" initialValue={staff.find(row => row.isActive)?.id} rules={required}><Select aria-label="Сотрудник" options={staff.filter(row => row.isActive).map(row => ({ value: row.id, label: row.fullName }))} /></Form.Item>
      <Form.Item name="dates" label="Даты смен (до 31 даты)" initialValue={[dayjs(selectedDate)]} rules={[...required, { validator: (_, dates: Dayjs[]) => dates?.length > 31 ? Promise.reject(new Error('Выберите не более 31 даты')) : dates?.some(date => !force && isClosed(date.format('YYYY-MM-DD'))) ? Promise.reject(new Error('Выберите даты вне оплаченных периодов')) : Promise.resolve() }]}><DatePicker multiple locale={ruDatePicker} disabled={!periodsReady} disabledDate={date => !force && isClosed(date.format('YYYY-MM-DD'))} format="DD.MM.YYYY" style={{ width: '100%' }} /></Form.Item></>}
    <Form.Item name="times" label="Время смены (Москва)" initialValue={[dayjs(`2000-01-01T${shift?.startTime ?? '08:00'}`), dayjs(`2000-01-01T${shift?.endTime ?? '20:00'}`)]} rules={required}><TimePicker.RangePicker onChange={() => setPreview(undefined)} aria-label="Время смены (Москва)" locale={ruDatePicker} placeholder={['Начало', 'Окончание']} format="HH:mm" /></Form.Item>
    <Typography.Paragraph aria-live="polite">Продолжительность: {times?.[0] && times[1] ? intervalHours(times[0].format('HH:mm'), times[1].format('HH:mm')) : 0} ч</Typography.Paragraph>
    {shift && <Button block style={{ height: 'auto', whiteSpace: 'normal' }} loading={previewBusy} onClick={() => void bulkInterval()}>Применить этот интервал ко всем рабочим дням недели</Button>}
    {preview && <><WeekPreview days={preview} /><Button onClick={() => setPreview(undefined)}>Отменить применение</Button></>}
    {shift && <Form.Item name="status" label="Статус смены" initialValue={shift.status} rules={required}><Select disabled={!!preview} options={Object.entries(shiftStatuses).map(([value, label]) => ({ value, label: value === 'ABSENT' && plannedKind(shift) ? shiftLabel(shift) : label }))} /></Form.Item>}
    <Form.Item name="notes" label="Комментарий" initialValue={shift?.notes?.replace(/^\[plan:(OFF|VACATION)\]\n?/, '')}><Input.TextArea disabled={!!preview} rows={3} maxLength={2000} style={{ resize: 'none' }} /></Form.Item>
    {shift && onDelete && <Button danger disabled={!periodsReady || isClosed(shift.date.slice(0, 10))} onClick={() => onDelete(shift)}>Удалить смену</Button>}
  </StableEntryModal>
}

export function AdjustmentModal({ row, from, to, onClose, onSaved }: { row: Payroll; from: string; to: string; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ bonuses: number; penalties: number }>()
  return <StableEntryModal title={`Начисления: ${row.fullName}`} form={form} submitLabel="Сохранить расчет" resources={['staff']} onClose={onClose} onSaved={onSaved}
    save={values => httpClient.post(`${API_URL}/payroll/calculations`, { ...values, staffId: row.staffId, from, to, expectedUpdatedAt: row.updatedAt ?? null })}>
    <Form.Item name="bonuses" label="Премии и надбавки (₽)" initialValue={Number(row.bonuses)} rules={required}><InputNumber aria-label="Премии и надбавки (₽)" {...moneyProps} /></Form.Item>
    <Form.Item name="penalties" label="Удержания и штрафы (₽)" initialValue={Number(row.penalties)} rules={required}><InputNumber aria-label="Удержания и штрафы (₽)" {...moneyProps} /></Form.Item>
  </StableEntryModal>
}

export function PayoutModal({ row, from, to, onClose, onSaved }: { row: Payroll; from: string; to: string; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ paymentMethod: 'CASH' | 'CARD' }>()
  return <StableEntryModal title="Выплатить зарплату" form={form} submitLabel="Выплатить зарплату" successMessage="Зарплата выплачена, расход добавлен в кассу" resources={['staff', 'cash-desk']} onClose={onClose} onSaved={onSaved}
    save={values => httpClient.post(`${API_URL}/payroll/payout`, { ...values, calculationId: row.id, expectedTotal: Number(row.totalAmount) })}>
    <Typography.Paragraph>{row.fullName} · {dayjs(from).format('DD.MM.YYYY')}–{dayjs(to).format('DD.MM.YYYY')}</Typography.Paragraph>
    <Alert showIcon type="warning" message={`Будет списано ${currency(row.totalAmount)}`} description="В кассе появится расход «Зарплата». Повторное нажатие не создаст вторую выплату." />
    <Form.Item name="paymentMethod" label="Способ выплаты" initialValue="CASH" rules={required}><Select aria-label="Способ выплаты" options={[{ value: 'CASH', label: 'Из кассы (Наличные)' }, { value: 'CARD', label: 'С расчетного счета (Безнал)' }]} /></Form.Item>
  </StableEntryModal>
}
