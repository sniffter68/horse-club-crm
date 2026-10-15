import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Form, Input, Modal, Select, Space, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import type { Horse } from '../catalogs/types'


export function ReplaceHorseAction({ bookingId, disabled, report, onSaved, onBusyChange }: {
  bookingId: string; horseId?: string; startTime?: string; endTime?: string; horses?: Horse[]; disabled?: boolean;
  report: (cause: unknown) => void; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const { message, modal } = App.useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const [form] = Form.useForm<{ horseId: string; reason?: string }>()
  const [options, setOptions] = useState<Horse[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void httpClient.get<Horse[]>(`${API_URL}/bookings/${bookingId}/available-horses`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setOptions(response.data) })
      .catch(cause => {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause); setLoadError(failure.message)
        if (failure.statusCode === 401) report(cause)
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, bookingId, revision, report])
  function reload() { setLoading(true); setLoadError(undefined); setRevision(value => value + 1) }
  function close() {
    if (lock.current) return
    if (form.isFieldsTouched()) modal.confirm({ title: 'Закрыть без сохранения?', content: 'Выбранная лошадь и причина замены не будут сохранены.',
      okText: 'Закрыть', cancelText: 'Продолжить заполнение', onOk: () => setOpen(false) })
    else setOpen(false)
  }
  async function save(values: { horseId: string; reason?: string }) {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusyChange(true); setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/bookings/${bookingId}/horse`, values)
      setOpen(false); void message.success('Лошадь заменена'); onSaved(); window.dispatchEvent(new Event('horse-assignment-changed'))
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message); void message.error(failure.message)
      if (failure.statusCode === 401) report(cause)
    } finally { lock.current = false; setBusy(false); onBusyChange(false) }
  }
  return <>
    <Button disabled={disabled || busy} onClick={() => { form.resetFields(); setError(undefined); setOptions([]); reload(); setOpen(true) }}>Сменить лошадь</Button>
    <Modal title="Сменить лошадь" open={open} footer={null} keyboard={!busy} maskClosable={!busy} closable={!busy} onCancel={close}>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
      {loadError && <Alert type="error" role="alert" showIcon message={loadError} action={<Button onClick={reload}>Повторить</Button>} />}
      <Form form={form} noValidate layout="vertical" onFinish={save} disabled={busy} scrollToFirstError>
        <Form.Item name="horseId" label="Новая лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}>
          <Select aria-label="Новая лошадь" showSearch optionFilterProp="label" loading={loading} disabled={busy || loading || Boolean(loadError)} notFoundContent="На это время нет доступных лошадей"
            options={options.map(horse => ({ value: horse.id, label: `${horse.name} · до ${horse.maxRiderWeight} кг` }))} />
        </Form.Item>
        <Form.Item name="reason" label="Причина замены"><Input aria-label="Причина замены" maxLength={500} /></Form.Item>
        <Typography.Paragraph type="secondary">Перед сохранением проверяются вес всадника, доступность лошади, дневная нагрузка и отдых. Оплаты и списания сохраняются.</Typography.Paragraph>
        <Space wrap><Button type="primary" htmlType="submit" loading={busy} aria-busy={busy} disabled={loading || Boolean(loadError) || !options.length}>Сохранить</Button>
          <Button disabled={busy} onClick={close}>Назад</Button></Space>
      </Form>
    </Modal>
  </>
}
