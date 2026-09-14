import { useState } from 'react'
import { useOne, type HttpError } from '@refinedev/core'
import { Alert, Button, Descriptions, Empty, List, Modal, Progress, Skeleton, Space, Tag, Typography } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Client } from '../catalogs/types'

type ClientMembership = {
  id: string
  totalLessons: number
  remainedLessons: number
  validUntil: string
  createdAt: string
  isActive: boolean
  pricingPlan: { id: string; name: string } | null
}

type ClientDetails = Client & { memberships: ClientMembership[] }

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' })

export function ClientList() {
  const [selectedClientId, setSelectedClientId] = useState<string>()
  const { result: client, query } = useOne<ClientDetails, HttpError>({
    resource: 'clients',
    id: selectedClientId,
    queryOptions: { enabled: Boolean(selectedClientId) },
  })

  return <>
    <CatalogList<Client> resource="clients" title="Клиенты" columns={[
      {
        key: 'name',
        title: 'Клиент',
        sorter: true,
        render: (_: unknown, row) => <Button type="link" style={{ padding: 0 }} onClick={() => setSelectedClientId(row.id)}>
          {[row.firstName, row.lastName].filter(Boolean).join(' ') || row.name || 'Без имени'}
        </Button>,
      },
      { key: 'phone', dataIndex: 'phone', title: 'Телефон', sorter: true, render: (value: string | null) => value || '—' },
      { key: 'roles', title: 'Роли', render: (_: unknown, row) => <Space>{row.isRider && <Tag color="blue">Всадник</Tag>}{row.isPayer && <Tag color="green">Плательщик</Tag>}</Space> },
      { key: 'preferences', dataIndex: 'preferences', title: 'Заметки', width: 260, ellipsis: true, render: (value: string | null) => value || '—' },
      { key: 'createdAt', dataIndex: 'createdAt', title: 'Дата создания', sorter: true, render: (value: string) => dateFormatter.format(new Date(value)) },
    ]} />

    <Modal title="Карточка клиента" open={Boolean(selectedClientId)} footer={null} width={720}
      destroyOnHidden onCancel={() => setSelectedClientId(undefined)}>
      {query.isLoading && <Skeleton active />}
      {query.error && <Alert type="error" showIcon message="Не удалось загрузить карточку клиента" description={query.error.message} />}
      {client && !query.isLoading && <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
          { key: 'name', label: 'ФИО', span: 2, children: [client.firstName, client.lastName].filter(Boolean).join(' ') || client.name || '—' },
          { key: 'phone', label: 'Телефон', children: client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : '—' },
          { key: 'email', label: 'Email', children: client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : '—' },
          { key: 'roles', label: 'Роли', span: 2, children: <Space>{client.isRider && <Tag color="blue">Всадник</Tag>}{client.isPayer && <Tag color="green">Плательщик</Tag>}</Space> },
          { key: 'preferences', label: 'Заметки', span: 2, children: client.preferences || '—' },
          ...(client.medicalNotes !== undefined ? [{ key: 'medicalNotes', label: 'Медицинские заметки', span: 2, children: client.medicalNotes || '—' }] : []),
        ]} />

        <div>
          <Typography.Title level={5}>Абонементы</Typography.Title>
          {client.memberships.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Абонементов нет" /> :
            <List<ClientMembership> dataSource={client.memberships} renderItem={membership => <List.Item>
              <div style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                  <Typography.Text strong>{membership.pricingPlan?.name || 'Индивидуальный абонемент'}</Typography.Text>
                  <Tag color={membership.isActive ? 'green' : 'default'}>{membership.isActive ? 'Активен' : 'Неактивен'}</Tag>
                </Space>
                <Progress
                  percent={membership.totalLessons > 0 ? Math.round(membership.remainedLessons / membership.totalLessons * 100) : 0}
                  format={() => `${membership.remainedLessons} / ${membership.totalLessons} занятий`}
                  status={membership.isActive ? 'active' : 'normal'}
                />
                <Typography.Text type="secondary">Действует до {dateFormatter.format(new Date(membership.validUntil))}</Typography.Text>
              </div>
            </List.Item>} />}
        </div>
      </Space>}
    </Modal>
  </>
}
