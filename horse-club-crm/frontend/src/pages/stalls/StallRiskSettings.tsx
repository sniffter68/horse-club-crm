import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space } from 'antd'
import { ToggleSettingRow } from '../../components/ToggleSettingRow'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

export interface StallRiskFlags { stallRiskAdjacent: boolean; stallRiskOpposite: boolean }

export function StallRiskSettings({ canManage, onSaved }: { canManage: boolean; onSaved?: () => Promise<void> }) {
  const [flags, setFlags] = useState<StallRiskFlags>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const pending = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    void httpClient.get<StallRiskFlags>(`${API_URL}/settings/stall-risk`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setFlags(data); setError(undefined) } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [revision])
  async function save(key: keyof StallRiskFlags, value: boolean) {
    if (pending.current || !canManage || !flags) return
    pending.current = true; setBusy(true); setError(undefined)
    try {
      const { data } = await httpClient.patch<StallRiskFlags>(`${API_URL}/settings/stall-risk`, { [key]: value })
      setFlags(data)
      await onSaved?.()
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <Space direction="vertical" style={{ width: '100%' }}>
    <ToggleSettingRow title="Риск соседства рядом (смежные денники)" description="Предупреждать о жеребце рядом с кобылой или другим жеребцом."
      checked={flags?.stallRiskAdjacent ?? true} disabled={!flags || !canManage || busy} onChange={value => void save('stallRiskAdjacent', value)} />
    <ToggleSettingRow title="Риск соседства напротив (через проход)" description="Учитывать денники через проход. Для широкого прохода можно выключить."
      checked={flags?.stallRiskOpposite ?? false} disabled={!flags || !canManage || busy} onChange={value => void save('stallRiskOpposite', value)} />
    {error && <Alert role="alert" type="error" showIcon message={error} action={!flags ? <Button onClick={() => setRevision(value => value + 1)}>Повторить</Button> : undefined} />}
  </Space>
}
