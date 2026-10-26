import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Checkbox, Switch, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { StableEntryModal } from '../stable/shared'
import { currency } from '../cash-desk/shared'
import { paidPeriodFor, shiftStatuses, type PaidPeriod, type Payroll, type Shift, type ShiftStatus, type Staff } from './types'
import { VkProfileField, VkProfileLink } from '../../components/VkProfileLink'
import { PhoneField } from '../../components/PhoneField'
import { phonePayload } from '../../components/formatPhone'
import { usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { staffRoles } from './types'
import { isUuid } from '../../uuid'

const required = [{ required: true, message: 'Заполните поле' }]
const moneyProps = { min: 0, max: 9999999999.99, precision: 2, style: { width: '100%' } }

export function ProfileModal({ staff, onClose, onSaved }: { staff?: Staff; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const { data: role } = usePermissions<Role>({})
  const access = Form.useWatch('createCrmAccess', form)
  const linkedUser = Form.useWatch('userId', form)
  const [candidates, setCandidates] = useState<Array<{ id: string; role?: string; email: string; vkId?: string | null; trainer?: { fullName: string; name: string } }>>([])
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (staff) return
    const controller = new AbortController()
    void httpClient.get(`${API_URL}/staff/candidates`, { signal: controller.signal }).then(res => setCandidates(res.data)).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [staff])
  return <StableEntryModal variant="drawer" title={staff ? `Редактирование сотрудника: ${staff.fullName}` : 'Добавить сотрудника'} form={form} submitLabel="Сохранить" resources={['staff', 'trainers', 'schedule', 'dashboard-stats']} onClose={onClose} onSaved={onSaved} successMessage="Данные сотрудника обновлены"
    save={values => {
      if ((staff && !isUuid(staff.id)) || (values.userId && !isUuid(values.userId))) throw new Error('Некорректный идентификатор сотрудника')
      const payload = { ...values, vkId: values.vkId?.trim() || null, phone: phonePayload(values.phone) }
      if (!values.createCrmAccess) delete payload.temporaryPassword
      if (values.userId) {
        delete payload.createCrmAccess
        delete payload.temporaryPassword
        delete payload.email
      }
      return staff ? httpClient.patch(`${API_URL}/staff/${staff.id}`, payload) : httpClient.post(`${API_URL}/staff`, payload)
    }}>
    {error && <Alert type="error" message={error} />}
    {!staff && <Form.Item name="userId" label="Существующая учетная запись (необязательно)"><Select allowClear aria-label="Учетная запись" showSearch optionFilterProp="label" options={candidates.map(user => ({ value: user.id, label: user.email }))} onChange={id => {
      const selected = candidates.find(user => user.id === id)
      form.setFieldValue('vkId', selected?.vkId || '')
      form.setFieldValue('role', selected?.role ?? 'OTHER')
      const trainer = selected?.trainer
      if (trainer) form.setFieldValue('fullName', trainer.fullName || trainer.name)
    }} /></Form.Item>}
    {staff && <VkProfileLink id={staff.userId} name={staff.fullName} vkId={staff.user?.vkId} kind="STAFF" readOnly />}
    <VkProfileField initialValue={staff?.user?.vkId} />
    <Form.Item name="fullName" label="ФИО" initialValue={staff?.fullName} rules={required}><Input aria-label="ФИО" maxLength={150} /></Form.Item>
    <Form.Item name="role" label="Роль" initialValue={staff?.user?.role ?? 'OTHER'} rules={required}><Select aria-label="Роль" options={Object.entries(staffRoles).filter(([value]) => role === 'ADMIN' || value !== 'ADMIN').map(([value, label]) => ({ value, label }))} /></Form.Item>
    {!linkedUser && <>
      <Form.Item name="createCrmAccess" valuePropName="checked" initialValue={staff?.user?.crmAccess ?? false}><Checkbox>Создать доступ в CRM</Checkbox></Form.Item>
      <Form.Item name="email" label="Email" initialValue={staff?.user?.email?.endsWith('@staff.invalid') ? undefined : staff?.user?.email} rules={[{ type: 'email', message: 'Укажите корректный email' }, ...(access ? required : [])]}><Input aria-label="Email" autoComplete="off" /></Form.Item>
      {access && <Form.Item name="temporaryPassword" label="Временный пароль" rules={[...(!staff || !staff.user?.crmAccess ? required : []), { min: 8, message: 'Не менее 8 символов' }]}><Input.Password aria-label="Временный пароль" autoComplete="new-password" maxLength={72} /></Form.Item>}
    </>}
    <Form.Item name="roleTitle" label="Должность" initialValue={staff?.roleTitle} rules={required}><Input aria-label="Должность" maxLength={150} /></Form.Item>
    <PhoneField initialValue={staff?.phone} />
    <Form.Item name="scheduleColor" label="Цвет в расписании" initialValue={staff?.scheduleColor} rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: 'Укажите цвет в формате #724C39' }]}><Input aria-label="Цвет в расписании" maxLength={7} placeholder="#724C39" /></Form.Item>
    {([['shiftRate', 'Ставка за смену (₽)'], ['lessonRate', 'Индивидуальное занятие (₽)'], ['groupLessonRate', 'Групповое занятие (₽)'], ['lessonPercentage', 'Процент от стоимости занятий (%)']] as const).map(([name, label]) =>
      <Form.Item key={name} name={name} label={label} initialValue={staff?.[name] == null ? undefined : Number(staff[name])}><InputNumber {...moneyProps} max={name === 'lessonPercentage' ? 100 : moneyProps.max} /></Form.Item>)}
    <Typography.Paragraph type="secondary">Фиксированная ставка и процент складываются. Групповая ставка начисляется один раз за занятие с несколькими участниками; без отдельной ставки используется индивидуальная.</Typography.Paragraph>
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
  return <StableEntryModal variant={variant} title={shift ? 'Изменить смену' : 'Запланировать смену'} form={form} submitLabel={shift ? 'Сохранить смену' : 'Запланировать смену'} resources={['staff']} onClose={onClose} onSaved={onSaved}
    save={values => {
      if (!isUuid(shift?.id ?? values.staffId)) throw new Error('Некорректный идентификатор сотрудника или смены')
      if (!periodsReady) throw new Error('Не удалось проверить закрытые периоды. Закройте форму и повторите попытку')
      if (!force && (shift ? isClosed(shift.date.slice(0, 10)) : values.dates.some(date => isClosed(date.format('YYYY-MM-DD'))))) throw new Error('Выберите даты вне оплаченных периодов или отмените оплату ведомости')
      const payload = { startTime: values.times[0].format('HH:mm'), endTime: values.times[1].format('HH:mm'), notes: values.notes, ...(force ? { force: true } : {}) }
      if (payload.startTime >= payload.endTime) return Promise.reject(new Error('Окончание смены должно быть позже начала в тот же день'))
      return shift ? httpClient.patch(`${API_URL}/staff/shifts/${shift.id}`, { ...payload, status: values.status }) : httpClient.post(`${API_URL}/staff/shifts`, { ...payload, staffId: values.staffId, dates: values.dates.map(date => date.format('YYYY-MM-DD')) })
    }}>
    {leading}
    {periodError && <Alert showIcon type="error" message="Не удалось загрузить закрытые периоды" description={periodError} />}
    {role === 'ADMIN' && <Form.Item name="force" valuePropName="checked"><Checkbox>Подтверждаю корректировку закрытых дат: отменить оплату затронутых ведомостей и связанные расходы, вернуть ведомости в черновик</Checkbox></Form.Item>}
    {!shift && <><Form.Item name="staffId" label="Сотрудник" initialValue={staff.find(row => row.isActive)?.id} rules={required}><Select aria-label="Сотрудник" options={staff.filter(row => row.isActive).map(row => ({ value: row.id, label: row.fullName }))} /></Form.Item>
      <Form.Item name="dates" label="Даты смен (до 31 даты)" initialValue={[dayjs(selectedDate)]} rules={[...required, { validator: (_, dates: Dayjs[]) => dates?.length > 31 ? Promise.reject(new Error('Выберите не более 31 даты')) : dates?.some(date => !force && isClosed(date.format('YYYY-MM-DD'))) ? Promise.reject(new Error('Выберите даты вне оплаченных периодов')) : Promise.resolve() }]}><DatePicker multiple locale={ruDatePicker} disabled={!periodsReady} disabledDate={date => !force && isClosed(date.format('YYYY-MM-DD'))} format="DD.MM.YYYY" style={{ width: '100%' }} /></Form.Item></>}
    <Form.Item name="times" label="Время смены (Москва)" initialValue={[dayjs(`2000-01-01T${shift?.startTime ?? '08:00'}`), dayjs(`2000-01-01T${shift?.endTime ?? '20:00'}`)]} rules={required}><TimePicker.RangePicker locale={ruDatePicker} placeholder={['Начало', 'Окончание']} format="HH:mm" /></Form.Item>
    {shift && <Form.Item name="status" label="Статус смены" initialValue={shift.status} rules={required}><Select options={Object.entries(shiftStatuses).map(([value, label]) => ({ value, label }))} /></Form.Item>}
    <Form.Item name="notes" label="Комментарий" initialValue={shift?.notes}><Input.TextArea rows={3} maxLength={2000} style={{ resize: 'none' }} /></Form.Item>
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
