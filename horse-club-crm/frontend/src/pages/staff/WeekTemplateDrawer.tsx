import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { StableEntryModal } from '../stable/shared'
import type { ClubSchedule } from '../schedule/types'
import type { Staff } from './types'
import { generateWeek, weekTemplates, type WeekTemplate } from './weekTemplates'
import { WeekPreview } from './WeekPreview'

export function WeekTemplateDrawer({ staff, date, onClose, onSaved }: { staff: Staff[]; date: string; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ staffId: string; week: Dayjs; template: WeekTemplate; cycleStart: Dayjs }>()
  const [schedule, setSchedule] = useState<ClubSchedule>()
  const [error, setError] = useState<string>()
  const template = Form.useWatch('template', form) ?? '5/2'
  const week = Form.useWatch('week', form) ?? dayjs(date)
  const cycleStart = Form.useWatch('cycleStart', form) ?? week
  useEffect(() => {
    const controller = new AbortController()
    void httpClient.get<ClubSchedule>(`${API_URL}/settings/club-schedule`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setSchedule(data) }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [])
  const days = schedule ? generateWeek(week.format('YYYY-MM-DD'), template, schedule, cycleStart.format('YYYY-MM-DD')) : []
  return <StableEntryModal variant="drawer" title="Применить шаблон" form={form} submitDisabled={!schedule} submitLabel="Применить к неделе" resources={['staff']} onClose={onClose} onSaved={onSaved} save={values => {
    if (!isUuid(values.staffId)) throw new Error('Некорректный идентификатор сотрудника')
    if (!schedule) throw new Error('Режим работы клуба не загружен. Закройте форму и повторите попытку')
    return httpClient.post(`${API_URL}/staff/shifts`, { staffId: values.staffId, days })
  }}>
    {error && <Alert type="error" message={error} />}
    <Form.Item name="staffId" label="Сотрудник" initialValue={staff.find(person => person.isActive)?.id} rules={[{ required: true }]}><Select aria-label="Сотрудник" options={staff.filter(person => person.isActive).map(person => ({ value: person.id, label: person.fullName }))} /></Form.Item>
    <Form.Item name="week" label="Неделя, содержащая дату" initialValue={dayjs(date)} rules={[{ required: true }]}><DatePicker allowClear={false} locale={ruDatePicker} format="DD.MM.YYYY" /></Form.Item>
    <Form.Item name="template" label="Шаблон" initialValue="5/2"><Select aria-label="Шаблон недели" options={Object.entries(weekTemplates).map(([value, label]) => ({ value, label }))} /></Form.Item>
    {template === '2/2' && <Form.Item name="cycleStart" label="Первый рабочий день цикла 2/2" initialValue={week}><DatePicker allowClear={false} locale={ruDatePicker} format="DD.MM.YYYY" /></Form.Item>}
    <Alert type="info" message="Неделя с понедельника по воскресенье. Выходные клуба учитываются. Закрытые, начатые и отработанные смены защищены от замены." />
    <WeekPreview days={days} />
  </StableEntryModal>
}
