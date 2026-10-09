import { useRef, useState } from 'react'
import { Alert, App, Button, Form, Input, Modal, Select, Space, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import type { Horse } from '../catalogs/types'
import { useTriadAvailability } from './useTriadAvailability'

export function ReplaceHorseAction({ bookingId, horseId, startTime, endTime, horses, disabled, report, onSaved, onBusyChange }: {
  bookingId: string; horseId?: string; startTime: string; endTime: string; horses: Horse[]; disabled?: boolean;
  report: (cause: unknown) => void; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const [form] = Form.useForm<{ horseId: string; reason?: string }>()
  const availability = useTriadAvailability(open ? startTime : undefined, open ? endTime : undefined, revision, report)
  async function save(values: { horseId: string; reason?: string }) {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusyChange(true); setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/bookings/${bookingId}/horse`, values)
      setOpen(false); void message.success('Лошадь заменена'); onSaved()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message); void message.error(failure.message)
      if (failure.statusCode === 401) report(cause)
    } finally { lock.current = false; setBusy(false); onBusyChange(false) }
  }
  return <>
    <Button disabled={disabled || busy} onClick={() => { form.resetFields(); setError(undefined); setRevision(value => value + 1); setOpen(true) }}>Заменить лошадь</Button>
    <Modal title="Заменить лошадь" open={open} footer={null} keyboard={!busy} maskClosable={!busy} closable={!busy} onCancel={() => { if (!lock.current) setOpen(false) }}>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
      {availability.error && <Alert type="error" showIcon message={availability.error} action={<Button onClick={() => setRevision(value => value + 1)}>Повторить</Button>} />}
      <Form form={form} noValidate layout="vertical" onFinish={save} disabled={busy} scrollToFirstError>
        <Form.Item name="horseId" label="Новая лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}>
          <Select aria-label="Новая лошадь" showSearch optionFilterProp="label" loading={availability.loading} notFoundContent="Других активных лошадей нет"
            options={horses.filter(horse => horse.status === 'active' && !horse.isUnavailable && horse.id !== horseId).map(horse => {
              const load = availability.data?.horseWorkloads.find(row => row.horseId === horse.id)
              return { value: horse.id, label: `${horse.name} · ${horse.breed || 'Порода не указана'} · до ${horse.maxRiderWeight} кг · ${load ? `${load.currentWorkloadMinutes} / ${load.maxDailyWorkloadMinutes} мин` : 'нагрузка недоступна'}` }
            })} />
        </Form.Item>
        <Form.Item name="reason" label="Причина замены"><Input aria-label="Причина замены" maxLength={500} /></Form.Item>
        <Typography.Paragraph type="secondary">Перед сохранением проверяются вес всадника, доступность лошади, дневная нагрузка и отдых. Оплаты и списания сохраняются.</Typography.Paragraph>
        <Space wrap><Button type="primary" htmlType="submit" loading={busy} aria-busy={busy} disabled={availability.loading || Boolean(availability.error) || !availability.data}>Заменить лошадь</Button>
          <Button disabled={busy} onClick={() => setOpen(false)}>Назад</Button></Space>
      </Form>
    </Modal>
  </>
}
