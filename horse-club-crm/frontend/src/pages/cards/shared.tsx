import type { ReactNode } from 'react'
import { useOne, type BaseRecord, type HttpError } from '@refinedev/core'
import { Alert, Button, Modal, Skeleton } from 'antd'

export function CardLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <Button type="link" style={{ height: 'auto', padding: 0, textAlign: 'left' }} onClick={onClick}>{children}</Button>
}

export function DetailsModal<T extends BaseRecord>({ resource, id, title, children, onClose, width = 820 }: {
  resource: string
  id?: string
  title: string
  width?: number
  onClose: () => void
  children: (record: T) => ReactNode
}) {
  const { result, query } = useOne<T, HttpError>({
    resource,
    id,
    queryOptions: { enabled: Boolean(id) },
  })

  return <Modal title={title} open={Boolean(id)} footer={null} width={width} destroyOnHidden
    onCancel={onClose}>
    {query.isLoading && <Skeleton active />}
    {query.error && <Alert type="error" showIcon message="Не удалось загрузить карточку" description={query.error.message} />}
    {result && !query.isLoading && children(result)}
  </Modal>
}
