import { useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, App, Button, Form, Input, Modal, Space, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../httpClient'
import { isUuid } from '../uuid'
import { usePermissions } from '../modulePermissions'
import { EntryOverlay } from './EntryOverlay'

type Identity = { telegramUserId?: string | null; telegramUsername?: string | null }
type Props = Identity & { id: string; name: string; kind: 'client' | 'user'; role?: 'staff' | 'trainer' | 'admin'; readOnly?: boolean; onChanged?: () => void }

export function TelegramProfileLink({ id, name, kind, telegramUserId, telegramUsername, readOnly, onChanged }: Props) {
  const invalidate = useInvalidate()
  const permissions = usePermissions()
  const canWrite = !readOnly && permissions.canWrite(kind === 'client' ? 'SCHEDULE' : 'STAFF_PAYROLL')
  const { mutate: onError } = useOnError()
  const { message } = App.useApp()
  const source = JSON.stringify([id, telegramUserId, telegramUsername])
  const [saved, setSaved] = useState<{ source: string; identity: Identity }>()
  const identity = saved?.source === source ? saved.identity : { telegramUserId, telegramUsername }
  const setIdentity = (identity: Identity) => setSaved({ source, identity })
  const [form] = Form.useForm<{ username: string }>()
  const [open, setOpen] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = () => { requestAnimationFrame(() => trigger.current?.focus()) }
  const resource = kind === 'client' ? 'clients' : 'users'
  const base = `${API_URL}/${resource}/${id}/telegram`
  const refresh = () => {
    void invalidate({ resource, id, invalidates: ['list', 'detail'] })
    if (kind === 'user') void invalidate({ resource: 'staff', invalidates: ['list'] })
    onChanged?.()
  }
  const fail = (cause: unknown) => {
    const failure = toHttpError(cause)
    setError(failure.message)
    if (failure.statusCode === 401) onError(failure)
  }
  const save = async ({ username }: { username: string }) => {
    if (busy || !canWrite) return
    if (!isUuid(id)) { setError('Некорректный идентификатор. Обновите страницу.'); return }
    setBusy(true); setError(undefined)
    try {
      const { data } = await httpClient.patch<Identity>(base, { username })
      setIdentity(data); setOpen(false); refresh(); void message.success('Telegram сохранён')
    } catch (cause) { fail(cause) }
    finally { setBusy(false) }
  }
  const unlink = async () => {
    if (busy || !canWrite) return
    if (!isUuid(id)) { setError('Некорректный идентификатор. Обновите страницу.'); return }
    setBusy(true); setError(undefined)
    try { await httpClient.delete(base); setIdentity({}); setUnlinkOpen(false); refresh(); void message.success('Telegram отвязан') }
    catch (cause) { fail(cause) }
    finally { setBusy(false) }
  }
  const linked = Boolean(identity.telegramUserId || identity.telegramUsername)
  return <Space direction="vertical" size={4}>
    <Tag className={`crm-tag ${linked ? 'crm-tag--success' : ''}`}>
      {linked ? identity.telegramUsername ? `Telegram: @${identity.telegramUsername}` : `ID: ${identity.telegramUserId}` : 'Telegram не привязан'}
    </Tag>
    {identity.telegramUsername && <a href={`https://t.me/${identity.telegramUsername}`} target="_blank" rel="noopener noreferrer">@{identity.telegramUsername}</a>}
    {canWrite && <Button ref={trigger} size="small" loading={busy} onClick={linked ? () => { setError(undefined); setUnlinkOpen(true) } : () => { form.resetFields(); setError(undefined); setOpen(true) }}>{linked ? 'Отвязать' : 'Привязать Telegram'}</Button>}
    <Modal title={`Отвязать Telegram · ${name}?`} open={unlinkOpen} destroyOnHidden
      okText="Отвязать" cancelText="Отмена" okButtonProps={{ danger: true, 'aria-label': 'Отвязать', 'aria-busy': busy }} cancelButtonProps={{ disabled: busy, autoFocus: true }} confirmLoading={busy}
      closable={!busy} maskClosable={!busy} keyboard={!busy} onOk={() => void unlink()} onCancel={() => { if (!busy) setUnlinkOpen(false) }} afterClose={() => trigger.current?.focus()}>
      <Typography.Paragraph>Бот перестанет узнавать этот профиль и отправлять ему уведомления.</Typography.Paragraph>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
    </Modal>
    <EntryOverlay variant="drawer" title={`Привязка Telegram · ${name}`} open={open} destroyOnHidden
      closable={!busy} maskClosable={!busy} keyboard={!busy} confirmLoading={busy} okText="Сохранить"
      okButtonProps={{ 'aria-label': 'Сохранить', disabled: busy }} cancelButtonProps={{ disabled: busy }}
      onOk={() => form.submit()} onCancel={() => { if (!busy) { setOpen(false); restoreFocus() } }} afterClose={restoreFocus}>
      <Typography.Paragraph>Укажите Telegram клиента или сотрудника. После первого сообщения боту @horseclub68_bot профиль свяжется автоматически.</Typography.Paragraph>
      <Form form={form} layout="vertical" noValidate onFinish={values => void save(values)} disabled={busy}>
        <Form.Item name="username" label="Telegram (username или ID)" rules={[{ required: true, whitespace: true, message: 'Укажите Telegram username или ID' }, { max: 256, message: 'Не более 256 символов' }]}>
          <Input placeholder="@username или https://t.me/username" maxLength={256} autoComplete="off" />
        </Form.Item>
      </Form>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
    </EntryOverlay>
  </Space>
}
