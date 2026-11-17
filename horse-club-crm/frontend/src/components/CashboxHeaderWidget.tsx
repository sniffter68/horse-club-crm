import { useEffect, useState } from 'react'
import { Alert, Button, Space, Spin } from 'antd'
import { Link } from 'react-router-dom'
import { ClubIcon } from './ClubIcon'
import { usePermissions } from '../modulePermissions'
import { getIdentity } from '../authStorage'
import { API_URL, httpClient, toHttpError } from '../httpClient'

interface CashboxSummary {
  mainBalance: number; boardingBalance: number; mainOperationsCount: number; boardingOperationsCount: number
}

export function CashboxHeaderWidget() {
  const permissions = usePermissions()
  const role = getIdentity()?.role
  const allowed = permissions.canRead('CASHBOX') && (role === 'ADMIN' || role === 'MANAGER')
  const [data, setData] = useState<CashboxSummary>()
  const [error, setError] = useState<string>()
  const [revision, retry] = useState(0)
  useEffect(() => {
    if (!allowed) return
    let controller: AbortController | undefined
    let disposed = false
    const refresh = async () => {
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      try {
        const response = await httpClient.get<CashboxSummary>(`${API_URL}/cashbox/summary`, { signal })
        if (!signal.aborted && !disposed) { setData(response.data); setError(undefined) }
      } catch (cause) { if (!signal.aborted && !disposed) setError(toHttpError(cause).message) }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    const changed = () => void refresh()
    window.addEventListener('cash-desk-paid', changed)
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); window.removeEventListener('cash-desk-paid', changed) }
  }, [allowed, revision])
  if (!allowed) return null
  if (error) return <Alert type="warning" showIcon message="Кассы: данные недоступны" description={error}
    action={<Button size="small" onClick={() => retry(n => n + 1)}>Повторить</Button>} />
  if (!data) return <Spin aria-label="Загрузка остатков касс" />
  return <Space wrap className="cashbox-header-widget" aria-label="Остатки касс">
    {([
      ['MAIN', 'Основная касса', data.mainBalance, data.mainOperationsCount],
      ['BOARDING', 'Касса постоя', data.boardingBalance, data.boardingOperationsCount],
    ] as const).map(([type, label, balance, count]) => <Link key={type} className="cashbox-header-link" to={`/payments?cashboxType=${type}`}>
      <span className="club-icon-label"><ClubIcon name="wallet" />{label}</span><strong>{balance.toLocaleString('ru-RU')} руб.</strong><span>{count.toLocaleString('ru-RU')} оп.</span>
    </Link>)}
  </Space>
}
