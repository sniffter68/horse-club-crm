import { useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, App, Button } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'

export function StallDeleteAction({ id, onDeleted, disabled }: { id: string; onDeleted?: () => void; disabled?: boolean }) {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const { modal, message } = App.useApp()
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  return <>
    <Button danger aria-label="Удалить денник" aria-busy={busy} loading={busy} disabled={disabled || busy || !isUuid(id)} onClick={() => modal.confirm({
      title: 'Удалить денник?', content: 'История постоя и перемещений сохранится.', okText: 'Удалить', cancelText: 'Отмена',
      autoFocusButton: 'cancel', okButtonProps: { danger: true }, onOk: async () => {
        if (lock.current) return
        lock.current = true; setBusy(true); setError(undefined)
        try {
          await httpClient.delete(`${API_URL}/stalls/${id}`)
          await invalidate({ resource: 'stalls', invalidates: ['resourceAll'] })
          onDeleted?.(); void message.success('Денник удалён')
        } catch (cause) {
          const failure = toHttpError(cause); setError(failure.message)
          if (failure.statusCode === 401) onError(failure)
        } finally { lock.current = false; setBusy(false) }
      },
    })}>Удалить денник</Button>
    {error && <Alert type="error" showIcon message="Денник не удалён" description={error} />}
  </>
}
