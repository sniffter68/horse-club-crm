import { Alert, Button, Empty, List, Progress, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import type { DailyHorseWorkload } from './types'

export function HorseWorkloadBadge({ workload, date }: { workload?: DailyHorseWorkload; date: string }) {
  if (!workload) return null
  const label = `${workload.horseName}: ${workload.currentWorkloadMinutes} / ${workload.maxDailyWorkloadMinutes} мин за ${date}${workload.status === 'UNAVAILABLE' ? ' · Недоступна' : ''}`
  return <Tooltip title={label}>
    <Tag tabIndex={0} aria-label={label} className={`crm-tag horse-workload-badge crm-tag--${workload.status === 'OVERLOADED' || workload.status === 'UNAVAILABLE' ? 'danger' : workload.status === 'AT_LIMIT' ? 'warning' : 'success'}`}>
      <span className="data-mono">{workload.currentWorkloadMinutes} / {workload.maxDailyWorkloadMinutes}</span> мин
      {workload.status === 'UNAVAILABLE' && ' · Недоступна'}
    </Tag>
  </Tooltip>
}

export function HorseWorkloadList({ rows, loading, error, onRefresh }: {
  rows: DailyHorseWorkload[]; loading: boolean; error?: string; onRefresh: () => void;
}) {
  return <div className="horse-workload-panel">
    <Button loading={loading} onClick={onRefresh} style={{ marginBottom: 16 }}>{error ? 'Повторить' : 'Обновить нагрузку'}</Button>
    {error ? <Alert type="error" showIcon message="Не удалось загрузить нагрузку лошадей" description={error} /> :
      <Spin spinning={loading}>
        <List<DailyHorseWorkload> dataSource={rows} rowKey="horseId" pagination={rows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
          locale={{ emptyText: loading ? 'Загрузка нагрузки…' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Лошадей пока нет" /> }}
          renderItem={row => <List.Item>
            <div style={{ width: '100%', minWidth: 0 }}>
              <Space wrap><Typography.Text strong>{row.horseName}</Typography.Text>
                <span className="data-mono">{row.currentWorkloadMinutes} / {row.maxDailyWorkloadMinutes} мин</span>
                <Tag className={`crm-tag crm-tag--${row.status === 'OVERLOADED' || row.status === 'UNAVAILABLE' ? 'danger' : row.status === 'AT_LIMIT' ? 'warning' : 'success'}`}>
                  {row.status === 'OVERLOADED' ? 'Перегрузка' : row.status === 'UNAVAILABLE' ? 'Недоступна' : row.status === 'AT_LIMIT' ? 'Лимит достигнут' : 'Есть резерв'}
                </Tag>
              </Space>
              <Progress percent={row.maxDailyWorkloadMinutes > 0 ? Math.min(100, Math.round(row.currentWorkloadMinutes / row.maxDailyWorkloadMinutes * 100)) : 100}
                showInfo={false} strokeColor={row.status === 'OVERLOADED' ? '#8C3838' : '#724C39'} />
            </div>
          </List.Item>} />
      </Spin>}
  </div>
}
