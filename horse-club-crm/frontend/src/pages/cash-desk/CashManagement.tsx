import { useRef, useState } from 'react'
import { Alert, App, Button, Form, Input, InputNumber, Modal, Space, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useInvalidate } from '@refinedev/core'
import { EntryOverlay } from '../../components/EntryOverlay'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

export function CashManagement({ onReset }: { onReset: () => void }) {
  const [action, setAction] = useState<'reset' | 'withdraw'>()
  return <>
    <Button onClick={() => setAction('withdraw')}>Инкассация / Снятие выручки</Button>
    <Button danger aria-label="Очистить журнал кассы" icon={<DeleteOutlined aria-hidden />} onClick={() => setAction('reset')}>Очистить журнал кассы</Button>
    {action && <CashManagementForm action={action} onClose={() => setAction(undefined)} onReset={onReset} />}
  </>
}

function CashManagementForm({ action, onClose, onReset }: { action: 'reset' | 'withdraw'; onClose: () => void; onReset: () => void }) {
  const { message } = App.useApp()
  const invalidate = useInvalidate()
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [locked, setLocked] = useState(false)
  const pending = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const submitted = useRef<Record<string, unknown> | null>(null)
  const [form] = Form.useForm<{ amount: number }>()
  const submit = async (values?: { amount: number }) => {
    if (pending.current || (action === 'reset' && word !== 'СБРОСИТЬ')) return
    pending.current = true; setBusy(true); setError(undefined); setLocked(true)
    submitted.current ??= action === 'reset'
      ? { confirmation: 'RESET_CASH', requestId: requestId.current }
      : { amount: values?.amount, requestId: requestId.current }
    try {
      await httpClient.post(`${API_URL}/cash/${action}`, submitted.current)
      if (action === 'reset') onReset()
      void invalidate({ resource: 'payments', invalidates: ['all'] })
      window.dispatchEvent(new Event('cash-desk-paid'))
      void message.success(action === 'reset' ? 'Касса успешно обнулена' : 'Выручка передана владельцу')
      onClose()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode >= 400 && failure.statusCode < 500) {
        setLocked(false); submitted.current = null; requestId.current = crypto.randomUUID()
      }
    }
    finally { pending.current = false; setBusy(false) }
  }
  const failure = error && <Alert type="error" role="alert" showIcon message={error} description="Повторите отправку: одна операция будет проведена только один раз." />
  if (action === 'reset') return <Modal open title="Обнулить кассу?" maskClosable={false} closable={!busy} keyboard={!busy}
    onCancel={() => { if (!pending.current) onClose() }} footer={<Space wrap>
      <Button autoFocus disabled={busy} onClick={onClose}>Сохранить кассу</Button>
      <Button danger type="primary" disabled={word !== 'СБРОСИТЬ'} loading={busy} onClick={() => void submit()}>Обнулить кассу</Button>
    </Space>}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="warning" showIcon message="Внимание! Все записи прихода, расхода и кассовых смен будут убраны из журнала. Баланс кассы станет 0 ₽." description="Операции сохранятся в архиве для аудита. Оплаты занятий, абонементы и выплаченные зарплаты сохранятся. Это действие нельзя отменить из интерфейса." />
      {failure}
      <div><Typography.Text><label htmlFor="cash-reset-word">Для подтверждения введите СБРОСИТЬ</label></Typography.Text>
        <Input id="cash-reset-word" value={word} disabled={busy} autoComplete="off" onChange={event => setWord(event.target.value)} />
      </div>
    </Space>
  </Modal>
  return <EntryOverlay open variant="drawer" title="Инкассация / Снятие выручки" closable={!busy} keyboard={!busy} maskClosable={false} onCancel={() => { if (!pending.current) onClose() }}
    footer={<Space><Button disabled={busy} onClick={onClose}>Отмена</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>Передать выручку</Button></Space>}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="info" showIcon message="Передача наличной выручки владельцу" description="Сумма будет вычтена из наличного остатка и сохранена в истории расходов. Смена закрывается отдельно." />
      {failure}
      <Form form={form} noValidate layout="vertical" onFinish={submit} disabled={busy || locked}>
        <Form.Item name="amount" label="Сумма инкассации, ₽" rules={[{ required: true, type: 'number', min: 0.01, max: 9999999999.99, message: 'Введите положительную сумму' }]}>
          <InputNumber min={0.01} max={9999999999.99} precision={2} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Space>
  </EntryOverlay>
}
