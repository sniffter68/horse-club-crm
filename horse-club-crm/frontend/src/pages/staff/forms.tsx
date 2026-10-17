import { useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Switch, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { StableEntryModal } from '../stable/shared'
import { currency } from '../cash-desk/shared'
import { shiftStatuses, type Payroll, type Shift, type ShiftStatus, type Staff } from './types'

const required = [{ required: true, message: 'Заполните поле' }]
const moneyProps = { min: 0, max: 9999999999.99, precision: 2, style: { width: '100%' } }

export function ProfileModal({ staff, onClose, onSaved }: { staff?: Staff; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [candidates, setCandidates] = useState<Array<{ id: string; email: string; trainer?: { fullName: string; name: string } }>>([])
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (staff) return
    const controller = new AbortController()
    void httpClient.get(`${API_URL}/staff/candidates`, { signal: controller.signal }).then(res => setCandidates(res.data)).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [staff])
  return <StableEntryModal title={staff ? `Ставки: ${staff.fullName}` : 'Добавить сотрудника'} form={form} submitLabel="Сохранить ставки" resources={['staff']} onClose={onClose} onSaved={onSaved}
    save={values => staff ? httpClient.patch(`${API_URL}/staff/${staff.id}`, values) : httpClient.post(`${API_URL}/staff`, values)}>
    {error && <Alert type="error" message={error} />}
    {!staff && <Form.Item name="userId" label="Учетная запись" rules={required}><Select aria-label="Учетная запись" showSearch optionFilterProp="label" options={candidates.map(user => ({ value: user.id, label: user.email }))} onChange={id => {
      const trainer = candidates.find(user => user.id === id)?.trainer
      if (trainer) form.setFieldValue('fullName', trainer.fullName || trainer.name)
    }} /></Form.Item>}
    <Form.Item name="fullName" label="ФИО" initialValue={staff?.fullName} rules={required}><Input aria-label="ФИО" maxLength={150} /></Form.Item>
    <Form.Item name="roleTitle" label="Должность" initialValue={staff?.roleTitle} rules={required}><Input aria-label="Должность" maxLength={150} /></Form.Item>
    {([['shiftRate', 'Ставка за смену (₽)'], ['lessonRate', 'Индивидуальное занятие (₽)'], ['groupLessonRate', 'Групповое занятие (₽)'], ['lessonPercentage', 'Процент от стоимости занятий (%)']] as const).map(([name, label]) =>
      <Form.Item key={name} name={name} label={label} initialValue={staff?.[name] == null ? undefined : Number(staff[name])}><InputNumber {...moneyProps} max={name === 'lessonPercentage' ? 100 : moneyProps.max} /></Form.Item>)}
    <Typography.Paragraph type="secondary">Фиксированная ставка и процент складываются. Групповая ставка начисляется один раз за занятие с несколькими участниками; без отдельной ставки используется индивидуальная.</Typography.Paragraph>
    <Form.Item name="isActive" label="Активный сотрудник" valuePropName="checked" initialValue={staff?.isActive ?? true}><Switch /></Form.Item>
  </StableEntryModal>
}

export function ShiftModal({ staff, shift, selectedDate, onClose, onSaved, onDelete }: { staff: Staff[]; shift?: Shift; selectedDate: string; onClose: () => void; onSaved: () => void; onDelete?: (shift: Shift) => void }) {
  const [form] = Form.useForm<{ staffId: string; dates: Dayjs[]; times: [Dayjs, Dayjs]; status: ShiftStatus; notes?: string }>()
  return <StableEntryModal title={shift ? 'Изменить смену' : 'Запланировать смену'} form={form} submitLabel={shift ? 'Сохранить смену' : 'Запланировать смену'} resources={['staff']} onClose={onClose} onSaved={onSaved}
    save={values => {
      const payload = { startTime: values.times[0].format('HH:mm'), endTime: values.times[1].format('HH:mm'), notes: values.notes }
      if (payload.startTime >= payload.endTime) return Promise.reject(new Error('Окончание смены должно быть позже начала в тот же день'))
      return shift ? httpClient.patch(`${API_URL}/staff/shifts/${shift.id}`, { ...payload, status: values.status }) : httpClient.post(`${API_URL}/staff/shifts`, { ...payload, staffId: values.staffId, dates: values.dates.map(date => date.format('YYYY-MM-DD')) })
    }}>
    {!shift && <><Form.Item name="staffId" label="Сотрудник" initialValue={staff.find(row => row.isActive)?.id} rules={required}><Select aria-label="Сотрудник" options={staff.filter(row => row.isActive).map(row => ({ value: row.id, label: row.fullName }))} /></Form.Item>
      <Form.Item name="dates" label="Даты смен (до 31 даты)" initialValue={[dayjs(selectedDate)]} rules={[...required, { validator: (_, dates: Dayjs[]) => dates?.length > 31 ? Promise.reject(new Error('Выберите не более 31 даты')) : Promise.resolve() }]}><DatePicker multiple locale={ruDatePicker} format="DD.MM.YYYY" style={{ width: '100%' }} /></Form.Item></>}
    <Form.Item name="times" label="Время смены (Москва)" initialValue={[dayjs(`2000-01-01T${shift?.startTime ?? '08:00'}`), dayjs(`2000-01-01T${shift?.endTime ?? '20:00'}`)]} rules={required}><TimePicker.RangePicker locale={ruDatePicker} placeholder={['Начало', 'Окончание']} format="HH:mm" /></Form.Item>
    {shift && <Form.Item name="status" label="Статус смены" initialValue={shift.status} rules={required}><Select options={Object.entries(shiftStatuses).map(([value, label]) => ({ value, label }))} /></Form.Item>}
    <Form.Item name="notes" label="Комментарий" initialValue={shift?.notes}><Input.TextArea rows={3} maxLength={2000} style={{ resize: 'none' }} /></Form.Item>
    {shift && onDelete && <Button danger onClick={() => onDelete(shift)}>Удалить смену</Button>}
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
