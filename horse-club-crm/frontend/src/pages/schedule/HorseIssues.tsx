import { useCallback, useEffect, useState } from 'react'
import { useOnError } from '@refinedev/core'
import { Alert, Button, Empty, List, Pagination, Space, Spin, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import { clientName } from './triad'
import type { Client } from '../catalogs/types'
import { formatTime } from './time'
import { ReplaceHorseAction } from './ReplaceHorseAction'

interface HorseIssue {
  id: string; horseId: string; horseName: string; startTime: string; endTime: string;
  client: Pick<Client, 'id' | 'name' | 'firstName' | 'lastName'>;
}

export function HorseIssues({ horseId, revision = 0, readOnly = false }: { horseId?: string; revision?: number; readOnly?: boolean }) {
  const { canManage } = useCatalogPermissions()
  const { mutate: onError } = useOnError()
  const report = useCallback((cause: unknown) => onError(toHttpError(cause)), [onError])
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [rows, setRows] = useState<HorseIssue[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const refreshList = () => setRefresh(value => value + 1)
    window.addEventListener('horse-assignment-changed', refreshList)
    window.addEventListener('horse-status-changed', refreshList)
    return () => {
      window.removeEventListener('horse-assignment-changed', refreshList)
      window.removeEventListener('horse-status-changed', refreshList)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setLoading(true); setError(undefined)
      try {
        const response = await httpClient.get<HorseIssue[]>(`${API_URL}/bookings/horse-issues`, {
          signal: controller.signal, params: { horseId, _start: (page - 1) * 10, _end: page * 10 },
        })
        if (controller.signal.aborted) return
        const count = Number(response.headers['x-total-count'] ?? response.data.length)
        setRows(response.data); setTotal(count)
        if (page > 1 && !response.data.length) setPage(Math.max(1, Math.ceil(count / 10)))
      } catch (cause) {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause); setError(failure.message)
        if (failure.statusCode === 401) report(cause)
      } finally { if (!controller.signal.aborted) setLoading(false) }
    })
    return () => controller.abort()
  }, [horseId, page, refresh, revision, report])
  if (!horseId && !loading && !error && !total) return null
  return <Alert type={horseId ? 'info' : 'warning'} showIcon
    message={horseId ? 'Предстоящие занятия с этой лошадью' : `Требуют замены лошади: ${total}`}
    description={<Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text>{horseId ? 'При снятии лошади с занятий замените её в запланированных записях.' : 'Назначенная лошадь недоступна. Показаны будущие занятия за все даты.'}</Typography.Text>
      <Button size="small" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>{error ? 'Повторить' : 'Обновить список'}</Button>
      {loading ? <Spin aria-label="Загрузка предстоящих занятий" /> : error ? <Alert role="alert" type="error" message={error} /> : <>
        <List dataSource={rows} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Предстоящих занятий нет" /> }} renderItem={row => <List.Item key={row.id}>
          <Space wrap><span>{formatTime(row.startTime)} — {formatTime(row.endTime)}</span><strong>{clientName(row.client)}</strong><span>{row.horseName}</span>
            {canManage && !readOnly && <ReplaceHorseAction bookingId={row.id} report={report} disabled={busy} onBusyChange={setBusy} onSaved={() => {}} />}
          </Space>
        </List.Item>} />
        {total > 10 && <Pagination simple current={page} pageSize={10} total={total} showSizeChanger={false} disabled={busy} onChange={setPage} />}
      </>}
    </Space>} />
}
