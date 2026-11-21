import { Card, Statistic } from 'antd'
import { currency } from './shared'

export function CashMetrics({ items, loading, unavailable, turnover = false }: {
  items: ReadonlyArray<readonly [string, string | undefined]>
  loading: boolean; unavailable: boolean; turnover?: boolean
}) {
  return <div className={`cash-metrics gap-6${turnover ? ' cash-metrics--turnover' : ''}`}>
    {items.map(([title, value]) => <Card className="cash-metric-card" key={title} data-testid="cash-metric-card">
      <Statistic title={title} value={unavailable || value === undefined ? '—' : currency(value)} loading={loading} />
    </Card>)}
  </div>
}
