import { Alert, Button, Spin, Typography } from 'antd'
import { usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { PendingLeads } from './PendingLeads'
import { useWorkspace } from '../workspace/useWorkspace'
import type { AdminSummary } from '../workspace/types'

export function LeadsPage() {
  const { data: role } = usePermissions<Role>({})
  const { data, error, loading, refresh } = useWorkspace<AdminSummary>('admin-summary')
  if (role !== 'ADMIN') return <Alert type="warning" message="Заявки доступны администратору" />
  if (loading) return <Spin aria-label="Загрузка заявок" />
  if (error || !data) return <Alert type="error" message={error || 'Заявки недоступны'} action={<Button onClick={refresh}>Повторить</Button>} />
  return <section aria-label="Заявки"><Typography.Title level={2}>Заявки</Typography.Title>
    <PendingLeads leads={data.leadRequests} loading={loading} onProcessed={refresh} />
  </section>
}
