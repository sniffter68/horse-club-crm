import { useRef, useState } from 'react'
import { Alert, App, Button, Modal, Space, Spin, Typography } from 'antd'
import { useInvalidate } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { useCatalogPermissions } from '../catalogs/permissions'
import { money } from '../catalogs/format'

type Preview = { name?: string; title?: string; deletedAt?: string | null; _count: Record<string, number>;
  cashboxPosted?: boolean; remainingUnits?: string | number; initialUnits?: string | number;
  totalLessons?: number; remainedLessons?: number; totalPrice?: string | number; boardingBalance?: string | number;
  payments?: Array<{ amount: string | number; status: string }> }

export function ArchiveAction({ id, resource, archived, onChanged }: {
  id: string; resource: 'clients' | 'memberships'; archived?: boolean; onChanged?: () => void;
}) {
  const { canManage } = useCatalogPermissions(resource)
  const { message } = App.useApp()
  const invalidate = useInvalidate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const client = resource === 'clients'
  const restore = client && archived
  const action = restore ? 'Восстановить' : client ? 'Удалить клиента' : 'Удалить / аннулировать'
  const hasHistory = preview && (Boolean(preview.deletedAt) || Object.values(preview._count).some(count => count > 0)
    || preview.cashboxPosted || Number(preview.boardingBalance ?? 0) !== 0 || preview.totalLessons !== preview.remainedLessons
    || Number(preview.remainingUnits ?? 0) !== Number(preview.initialUnits ?? 0))

  async function load() {
    if (lock.current) return
    setOpen(true); setPreview(undefined); setError(undefined)
    if (!isUuid(id)) { setError('Некорректный идентификатор. Обновите список.'); return }
    lock.current = true; setBusy(true)
    try { setPreview((await httpClient.get<Preview>(`${API_URL}/${resource}/${id}`)).data) }
    catch (cause) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }

  async function commit() {
    if (lock.current || !canManage || !preview || !isUuid(id)) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      const response = restore ? await httpClient.post(`${API_URL}/clients/${id}/restore`)
        : await httpClient.delete<{ message: string }>(`${API_URL}/${resource}/${id}`)
      void message.success(restore ? 'Клиент восстановлен' : response.data.message)
      setOpen(false)
      for (const target of ['clients', 'memberships', 'payments']) {
        void invalidate({ resource: target, invalidates: ['all'] }).catch(() => undefined)
      }
      onChanged?.()
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }

  if (!canManage || (!client && archived)) return null
  return <>
    <Button size="small" danger={!restore} onClick={() => void load()} disabled={busy}>{action}</Button>
    <Modal open={open} title={`${action}?`} closable={!busy} maskClosable={!busy} keyboard={!busy}
      onCancel={() => { if (!lock.current) setOpen(false) }} afterOpenChange={visible => { if (visible) cancel.current?.focus() }}
      footer={<Space wrap><Button ref={cancel} disabled={busy} onClick={() => setOpen(false)}>Отмена</Button>
        {!preview && !busy && <Button onClick={() => void load()}>Повторить загрузку</Button>}
        <Button type="primary" danger={!restore} disabled={!preview || !canManage} loading={busy} onClick={() => void commit()}>
          {restore ? 'Восстановить' : hasHistory ? client ? 'В архив' : 'Аннулировать' : 'Удалить безвозвратно'}
        </Button></Space>}>
      {busy && !preview && <Spin aria-label="Загрузка истории" />}
      {preview && <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text strong>{preview.name || preview.title || (client ? 'Клиент' : 'Абонемент')}</Typography.Text>
        {restore ? <Typography.Paragraph>Клиент снова появится в активных списках и выборе участников.</Typography.Paragraph>
          : client ? <Typography.Paragraph>{hasHistory
            ? `У клиента есть история (${preview._count.bookings} занятий). Клиент будет отправлен в архив, история оплат и тренировок сохранится. Восстановление доступно в разделе «Архив».`
            : 'Клиент будет удален безвозвратно.'}</Typography.Paragraph>
            : <><Typography.Paragraph>Использовано занятий: {Math.max(0, (preview.totalLessons ?? 0) - (preview.remainedLessons ?? 0))}. Стоимость: {money(preview.totalPrice)}.
              Оплачено: {money(preview.payments?.filter(p => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount), 0) ?? 0)}.</Typography.Paragraph>
              <Alert type="warning" showIcon message={hasHistory
                ? 'Абонемент будет аннулирован. Прошлые тренировки и оплаты сохранятся. Новые списания будут недоступны. При наличии остатка оформите возврат в кассе.'
                : 'Абонемент без занятий и финансовой истории будет удален безвозвратно.'} /></>}
        {!restore && <Typography.Text type="secondary">Сервер повторно проверит историю перед удалением. Если появились связанные записи, данные будут сохранены в архиве.</Typography.Text>}
      </Space>}
      {error && <Alert role="alert" type="error" showIcon message={error} />}
    </Modal>
  </>
}
