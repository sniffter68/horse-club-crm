import { useEffect } from 'react'
import { Alert, Button, Card, Form, Space, Spin, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ToggleSettingRow } from '../../components/ToggleSettingRow'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { ClubSchedule } from '../schedule/types'
import { clubWeekDays } from '../schedule/clubHours'
import { useClubSettings } from './useClubSettings'

const weekDayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
interface DayForm { dayOfWeek: number; isWorkingDay: boolean; openTime: Dayjs | null; closeTime: Dayjs | null }
interface ScheduleForm { weekDays: DayForm[] }

export function ClubScheduleSettings() {
  const { canManage, isLoading: permissionsLoading } = useCatalogPermissions('schedule')
  const state = useClubSettings<ClubSchedule>('club-schedule', 'График работы сохранён')
  const [form] = Form.useForm<ScheduleForm>()
  const values = Form.useWatch('weekDays', { form, preserve: true }) as DayForm[] | undefined
  useEffect(() => {
    if (!state.value) return
    const schedule = state.value
    const weekDays = clubWeekDays(schedule)
    form.setFieldsValue({ weekDays: weekDays.map(day => ({ ...day, openTime: dayjs(`2000-01-01T${day.openTime}:00`), closeTime: dayjs(`2000-01-01T${day.closeTime}:00`) })) })
  }, [state.value, form])
  async function save() {
    if (!canManage || !state.value) return
    const value = form.getFieldsValue(true) as ScheduleForm
    const previous = clubWeekDays(state.value)
    await state.save({ weekDays: value.weekDays.map((day, index) => {
      const valid = day.openTime?.isValid() && day.closeTime?.isValid() && day.openTime.format('HH:mm') < day.closeTime.format('HH:mm')
      // A holiday retains valid clocks for reopening; unfinished edits use the last saved pair.
      const clocks = !day.isWorkingDay && !valid ? previous[index] : undefined
      return { dayOfWeek: day.dayOfWeek, isWorkingDay: day.isWorkingDay,
        openTime: clocks?.openTime ?? day.openTime?.format('HH:mm') ?? previous[index].openTime,
        closeTime: clocks?.closeTime ?? day.closeTime?.format('HH:mm') ?? previous[index].closeTime }
    }) })
  }
  return <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 760 }}>
    <Typography.Title level={2}>Режим работы клуба</Typography.Title>
    <Typography.Text type="secondary">Часы работы по московскому времени. Выключите день, чтобы сделать его выходным.</Typography.Text>
    {!canManage && !permissionsLoading && <Alert type="info" showIcon message="Доступ только для чтения" />}
    {state.error && <Alert type="error" showIcon message={state.error} action={!state.value && <Button onClick={state.retry}>Повторить</Button>} />}
    <Card><Spin spinning={state.loading || permissionsLoading}>
      <Form noValidate form={form} layout="vertical" onFinish={save} onFinishFailed={({ errorFields }) => form.scrollToField(errorFields[0]?.name ?? [], { focus: true })}
        disabled={!canManage || !state.value || state.loading || state.saving} onKeyDown={event => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.closest('.ant-picker')) event.preventDefault()
        }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {weekDayNames.map((name, index) => <ToggleSettingRow key={name} title={name} data-testid={`schedule-day-${index + 1}`}
            description={values?.[index]?.isWorkingDay ? 'Рабочий день' : 'Выходной'} checked={values?.[index]?.isWorkingDay ?? false}
            onChange={checked => form.setFieldValue(['weekDays', index, 'isWorkingDay'], checked)}>
            <Space wrap align="start">
              <Form.Item name={['weekDays', index, 'openTime']} label="Открытие" rules={[{ required: true, message: 'Выберите время открытия' }]}>
                <TimePicker aria-label={`${name}: открытие`} format="HH:mm" needConfirm={false} allowClear={false} />
              </Form.Item>
              <Form.Item name={['weekDays', index, 'closeTime']} label="Закрытие" dependencies={[[ 'weekDays', index, 'openTime' ]]} rules={[
                { required: true, message: 'Выберите время закрытия' },
                { validator: (_, close: Dayjs | null) => {
                  const open = form.getFieldValue(['weekDays', index, 'openTime']) as Dayjs | undefined
                  return !open || !close || open.format('HH:mm') < close.format('HH:mm') ? Promise.resolve() : Promise.reject(new Error('Закрытие должно быть позже открытия'))
                } },
              ]}>
                <TimePicker aria-label={`${name}: закрытие`} format="HH:mm" needConfirm={false} allowClear={false} />
              </Form.Item>
            </Space>
            {canManage && <Button onClick={async () => {
              try { await form.validateFields([['weekDays', index, 'openTime'], ['weekDays', index, 'closeTime']]) } catch { return }
              const days = form.getFieldValue('weekDays') as DayForm[]
              form.setFieldValue('weekDays', days.map(day => day.isWorkingDay ? { ...day, openTime: days[index].openTime, closeTime: days[index].closeTime } : day))
            }}>Применить ко всем рабочим дням</Button>}
          </ToggleSettingRow>)}
          {canManage && <Button aria-label="Сохранить" type="primary" htmlType="submit" loading={state.saving}>Сохранить</Button>}
        </Space>
      </Form>
    </Spin></Card>
  </Space>
}
