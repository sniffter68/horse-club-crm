import { useRef, useState } from 'react'
import { Alert, Button, Modal, Space, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from './httpClient'
import { getIdentity } from './authStorage'

import { useDemoStatus } from './useDemoStatus'
import { usePermissions } from './modulePermissions'

export function DemoBanner() {
  const isDemo = useDemoStatus()
  const permissions = usePermissions()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const role = getIdentity()?.role
  if (!isDemo) return null
  const reset = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      await httpClient.post(`${API_URL}/demo/reset`, {}, { timeout: 90000 })
      window.location.reload()
    } catch (cause: unknown) {
      setError(toHttpError(cause).message)
    } finally { lock.current = false; setBusy(false) }
  }
  return <><div className="demo-banner" role="region" aria-label="Демо-стенд">
    <Space size={8}><Tag className="crm-tag crm-tag--accent">Демо-стенд</Tag><Typography.Text>КСК «Серебряная Подкова»</Typography.Text></Space>
    {(role === 'ADMIN' || role === 'MANAGER') && permissions.canWrite('CASHBOX') &&
      <Button size="small" aria-label="Сбросить данные" aria-busy={busy} onClick={() => { setError(undefined); setOpen(true) }} loading={busy}>Сбросить данные</Button>}
  </div>
    <Modal open={open} title="Сбросить данные демо-стенда?" closable={!busy} maskClosable={!busy} keyboard={!busy}
      onCancel={() => { if (!lock.current) setOpen(false) }}
      afterOpenChange={visible => { if (visible) cancel.current?.focus() }}
      footer={<Space><Button ref={cancel} disabled={busy} onClick={() => setOpen(false)}>Отмена</Button>
        <Button type="primary" danger aria-label="Сбросить данные" aria-busy={busy} disabled={busy} loading={busy} onClick={() => void reset()}>Сбросить данные</Button></Space>}>
      <Typography.Paragraph>Все изменения на демо-стенде будут удалены. Восстановятся вымышленные данные КСК «Серебряная Подкова».</Typography.Paragraph>
      {error && <Alert type="error" showIcon role="alert" message={error} />}
    </Modal>
  </>
}
