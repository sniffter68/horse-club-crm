import { useEffect, useRef, useState } from 'react'
import { useOnError, usePermissions } from '@refinedev/core'
import { Alert, App, Button, Card, Form, Select, Space, Spin, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { Role } from '../../authStorage'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

interface ClubSchedule { id: number; openTime: string; closeTime: string; dayOfWeekOff: number }
interface ScheduleForm { openTime: Dayjs; closeTime: Dayjs; dayOfWeekOff: number }
const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const toForm = (schedule: ClubSchedule): ScheduleForm => ({
  openTime: dayjs(`2000-01-01T${schedule.openTime}:00`),
  closeTime: dayjs(`2000-01-01T${schedule.closeTime}:00`),
  dayOfWeekOff: schedule.dayOfWeekOff,
})

export function SettingsPage() {
  const { data: role, isLoading: permissionsLoading } = usePermissions<Role>({})
  const canManage = role === 'ADMIN' || role === 'MANAGER'
  const { mutate: onError } = useOnError()
  const errorHandler = useRef(onError)
  useEffect(() => { errorHandler.current = onError }, [onError])
  const { message } = App.useApp()
  const [form] = Form.useForm<ScheduleForm>()
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    httpClient.get<ClubSchedule>(`${API_URL}/settings/club-schedule`, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        form.setFieldsValue(toForm(data)); setLoaded(true)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause)
        setError(failure.message)
        if (failure.statusCode === 401) errorHandler.current(failure)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [form, revision])

  async function save(values: ScheduleForm) {
    if (!canManage || !loaded || savingRef.current) return
    savingRef.current = true; setSaving(true); setError(undefined)
    try {
      const { data } = await httpClient.patch<ClubSchedule>(`${API_URL}/settings/club-schedule`, {
        openTime: values.openTime.format('HH:mm'), closeTime: values.closeTime.format('HH:mm'), dayOfWeekOff: values.dayOfWeekOff,
      })
      form.setFieldsValue(toForm(data))
      void message.success('График работы сохранён')
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) errorHandler.current(failure)
    } finally { savingRef.current = false; setSaving(false) }
  }

  return <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
    <Typography.Title level={2}>Режим работы клуба</Typography.Title>
    {role === 'TRAINER' && <Alert type="info" showIcon message="Доступ только для чтения" description="График изменяют администратор и менеджер клуба." />}
    {error && <Alert type="error" showIcon message={error} action={!loaded && <Button disabled={loading} onClick={() => { setError(undefined); setLoading(true); setRevision(value => value + 1) }}>Повторить</Button>} />}
    <Card><Spin spinning={loading || permissionsLoading}>
      <Form form={form} layout="vertical" onFinish={save} disabled={!canManage || !loaded || loading || saving}
        onKeyDown={event => {
          // Enter confirms typed time without implicitly submitting the whole form.
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.closest('.ant-picker')) event.preventDefault()
        }}>
        <Form.Item name="openTime" label="Время открытия" rules={[{ required: true, message: 'Выберите время открытия' }]}>
          <TimePicker format="HH:mm" needConfirm={false} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="closeTime" label="Время закрытия" dependencies={['openTime']} rules={[
          { required: true, message: 'Выберите время закрытия' },
          { validator: (_, close: Dayjs | null) => {
            const open = form.getFieldValue('openTime') as Dayjs | undefined
            return !open || !close || open.format('HH:mm') < close.format('HH:mm')
              ? Promise.resolve() : Promise.reject(new Error('Время закрытия должно быть позже времени открытия'))
          } },
        ]}>
          <TimePicker format="HH:mm" needConfirm={false} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="dayOfWeekOff" label="Выходной день" rules={[{ required: true, message: 'Выберите выходной день' }]}>
          <Select options={days.map((label, value) => ({ label, value }))} />
        </Form.Item>
        {canManage && <Button aria-label="Сохранить" type="primary" htmlType="submit" loading={saving}>Сохранить</Button>}
      </Form>
    </Spin></Card>
  </Space>
}
