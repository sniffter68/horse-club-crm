import { useState } from 'react'
import { useInvalidate } from '@refinedev/core'
import { Alert, App, Button, List, Popconfirm, Space, Typography } from 'antd'
import { ClientSelectWithCreate } from '../../components/ClientSelectWithCreate'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { useCatalogPermissions } from '../catalogs/permissions'

export type SharedMember = { clientId: string; client: { id: string; name: string; firstName?: string; lastName?: string } }
export function SharedMembershipAccess({ membershipId, ownerClientId, members = [], active, onChanged }: {
  membershipId: string; ownerClientId?: string | null; members?: SharedMember[]; active: boolean; onChanged?: () => void
}) {
  const { canManage } = useCatalogPermissions('memberships')
  const { message } = App.useApp()
  const invalidate = useInvalidate()
  const [clientId, setClientId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function save(id: string, remove = false) {
    if (busy) return
    if (!isUuid(membershipId) || !isUuid(id)) { setError('Выберите клиента из списка.'); return }
    setBusy(true); setError(undefined)
    try {
      if (remove) await httpClient.delete(`${API_URL}/memberships/${membershipId}/members/${id}`)
      else await httpClient.post(`${API_URL}/memberships/${membershipId}/members`, { clientId: id })
      setClientId(undefined); setAdding(false)
      await Promise.all(['clients', 'memberships'].map(resource => invalidate({ resource, invalidates: ['all'] })))
      onChanged?.()
      void message.success(remove ? 'Совместный доступ отключён' : 'Совместный доступ добавлен')
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { setBusy(false) }
  }
  return <section aria-label="Совместный доступ">
    <Typography.Title level={5}>Совместный доступ</Typography.Title>
    <Typography.Paragraph type="secondary">Участники используют общий остаток занятий. Владелец абонемента сохраняется.</Typography.Paragraph>
    <List dataSource={members} locale={{ emptyText: 'Дополнительных участников нет' }} renderItem={member => <List.Item actions={canManage ? [
      <Popconfirm key="remove" title={`Отключить доступ: ${member.client.name}?`} description="Новые списания для клиента будут запрещены. История посещений сохранится."
        okText="Отключить доступ" cancelText="Отмена" disabled={busy} onConfirm={() => save(member.clientId, true)}>
        <Button size="small" disabled={busy}>Отвязать клиента</Button>
      </Popconfirm>,
    ] : []}>{member.client.name || [member.client.firstName, member.client.lastName].filter(Boolean).join(' ')}</List.Item>} />
    {error && <Alert role="alert" type="error" showIcon message={error} />}
    {canManage && active && (adding ? <Space direction="vertical" style={{ width: '100%' }}>
      <ClientSelectWithCreate aria-label="Клиент для совместного доступа" value={clientId} onChange={setClientId} disabled={busy}
        excludedIds={[...(ownerClientId ? [ownerClientId] : []), ...members.map(m => m.clientId)]} />
      <Space><Button type="primary" aria-label="Добавить клиента" loading={busy} disabled={!clientId || busy} onClick={() => clientId && void save(clientId)}>Добавить клиента</Button>
        <Button disabled={busy} onClick={() => { setAdding(false); setClientId(undefined); setError(undefined) }}>Отмена</Button></Space>
    </Space> : <Button onClick={() => setAdding(true)}>Добавить клиента</Button>)}
  </section>
}
