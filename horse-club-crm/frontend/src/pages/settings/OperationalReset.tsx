import { useRef, useState } from 'react'
import { useInvalidate, useOnError, usePermissions } from '@refinedev/core'
import { Alert, App, Button, Card, Input, Modal, Space, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { Role } from '../../authStorage'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

const confirmationPhrase = 'RESET_ALL_OPERATIONAL_DATA'
const warning = 'Будут удалены все тренировки, платежи, абонементы и кассовые операции. Карточки клиентов, лошади и сотрудники сохранятся'

export function OperationalReset() {
  const { data: role } = usePermissions<Role>({})
  const { message } = App.useApp()
  const { mutate: onError } = useOnError()
  const invalidate = useInvalidate()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const pending = useRef(false)
  const requestId = useRef<string | undefined>(undefined)
  const cancel = useRef<HTMLButtonElement>(null)

  async function reset() {
    if (role !== 'ADMIN' || confirmation !== confirmationPhrase || pending.current) return
    pending.current = true; setBusy(true); setError(undefined)
    try {
      await httpClient.post(`${API_URL}/admin/reset-operational-data`, { confirmation, requestId: requestId.current }, { timeout: 90_000 })
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.statusCode === 0
        ? 'Ответ сервера не получен. Сброс мог завершиться. Повторите запрос в этом окне: ключ операции защитит новые данные от повторного удаления.'
        : failure.message)
      if (failure.statusCode === 401) onError(failure)
      pending.current = false; setBusy(false)
      return
    }
    // Invalidate every Refine/React Query cache, including all financial resources.
    // A refetch failure must never turn a committed reset into a failed mutation.
    try { await invalidate({ invalidates: ['all'], invalidationFilters: { queryKey: [], refetchType: 'active' },
      invalidationOptions: { cancelRefetch: true } }) } catch { /* Dashboard loads fresh on mount. */ }
    pending.current = false; setBusy(false); setOpen(false)
    navigate('/', { replace: true })
    void message.success('Тестовые данные кассы и занятий удалены. Учет обнулён')
  }

  if (role !== 'ADMIN') return null
  return <Card title="Подготовка к боевому учету">
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph>{warning}. Также удаляются зарплатные ведомости и закрытия месяцев. Действие необратимо.</Typography.Paragraph>
      <Button danger style={{ whiteSpace: 'normal', height: 'auto', minHeight: 40 }} onClick={() => {
        setOpen(true); setConfirmation(''); setError(undefined); requestId.current = crypto.randomUUID()
      }}>Очистить тестовые данные кассы и занятий</Button>
    </Space>
    <Modal title="Очистить тестовые данные?" open={open} maskClosable={false} closable={!busy} keyboard={!busy}
      onCancel={() => { if (!pending.current) setOpen(false) }} afterOpenChange={visible => { if (visible) cancel.current?.focus() }}
      footer={<Space wrap>
        <Button ref={cancel} disabled={busy} onClick={() => setOpen(false)}>Отмена</Button>
        <Button aria-label="Удалить все данные" danger type="primary" loading={busy} disabled={confirmation !== confirmationPhrase || busy} onClick={() => void reset()}>Удалить все данные</Button>
      </Space>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }} aria-busy={busy}>
        <Alert type="warning" showIcon message={warning} description="Будут обнулены остатки клиентов, кассы и безналичных средств. Зарплатные ведомости и месячные отчеты также удалятся. Восстановление через интерфейс невозможно." />
        <Typography.Paragraph id="reset-confirmation-help">Для подтверждения введите <Typography.Text code style={{ overflowWrap: 'anywhere' }}>{confirmationPhrase}</Typography.Text></Typography.Paragraph>
        <label htmlFor="operational-reset-confirmation">Контрольная фраза</label>
        <Input id="operational-reset-confirmation" aria-describedby="reset-confirmation-help" autoComplete="off" spellCheck={false}
          value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
        {error && <Alert role="alert" type="error" showIcon message={error} />}
        {busy && <Typography.Text role="status">Удаление данных… Дождитесь завершения операции.</Typography.Text>}
      </Space>
    </Modal>
  </Card>
}
