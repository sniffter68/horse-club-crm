import { useEffect, useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, App, Button, Modal, Space, Spin, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../httpClient'
import { isUuid } from '../uuid'
import { usePermissions } from '../modulePermissions'

type Identity = { telegramUserId?: string | null; telegramUsername?: string | null }
type Grant = { code: string; deepLink: string; expiresAt: string }
type Props = Identity & { id: string; name: string; kind: 'client' | 'user'; role?: 'staff' | 'trainer' | 'admin'; readOnly?: boolean; onChanged?: () => void }

export function TelegramProfileLink({ id, name, kind, role, telegramUserId, telegramUsername, readOnly, onChanged }: Props) {
  const invalidate = useInvalidate()
  const permissions = usePermissions()
  const canWrite = !readOnly && permissions.canWrite(kind === 'client' ? 'SCHEDULE' : 'STAFF_PAYROLL')
  const { mutate: onError } = useOnError()
  const { message } = App.useApp()
  const [identity, setIdentity] = useState<Identity>({ telegramUserId, telegramUsername })
  const [open, setOpen] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [grant, setGrant] = useState<Grant>()
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(Date.now())
  const trigger = useRef<HTMLButtonElement>(null)
  const telegramLink = useRef<HTMLElement | null>(null)
  const resource = kind === 'client' ? 'clients' : 'users'
  const base = `${API_URL}/${resource}/${id}`
  useEffect(() => { setIdentity({ telegramUserId, telegramUsername }) }, [id, telegramUserId, telegramUsername])
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
  const issue = async () => {
    if (busy || !canWrite) return
    setOpen(true); setError(undefined); setGrant(undefined)
    if (!isUuid(id)) { setError('Некорректный идентификатор. Обновите страницу.'); return }
    setBusy(true)
    try {
      const { data } = await httpClient.post<Grant>(`${base}/telegram-link`, kind === 'user' ? { role: role ?? 'staff' } : {})
      setGrant(data); setNow(Date.now())
    } catch (cause) { fail(cause) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (!open || !grant || !isUuid(id)) return
    const controller = new AbortController()
    let pending = false
    const poll = async () => {
      if (pending) return
      pending = true
      try {
        const { data } = await httpClient.get<Identity>(`${base}/telegram`, { signal: controller.signal })
        if (!controller.signal.aborted) {
          setError(undefined)
          if (data.telegramUserId) {
            setIdentity(data); setOpen(false); setGrant(undefined); refresh()
            void message.success('Telegram привязан')
          }
        }
      } catch (cause) { if (!controller.signal.aborted) fail(cause) }
      finally { pending = false }
    }
    const timer = window.setInterval(() => { void poll() }, 3000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { controller.abort(); window.clearInterval(timer); window.clearInterval(clock) }
    // The polling lifetime follows the displayed grant; callbacks use the same entity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grant, id, base])
  const unlink = async () => {
    if (!isUuid(id) || busy || !canWrite) return
    setBusy(true); setError(undefined)
    try { await httpClient.delete(`${base}/telegram`); setIdentity({}); setUnlinkOpen(false); refresh(); void message.success('Telegram отвязан') }
    catch (cause) { fail(cause) }
    finally { setBusy(false) }
  }
  const expired = grant ? now >= new Date(grant.expiresAt).getTime() : false
  useEffect(() => { if (open && grant && !expired) telegramLink.current?.focus() }, [open, grant, expired])
  return <Space direction="vertical" size={4}>
    <Tag className={`crm-tag ${identity.telegramUserId ? 'crm-tag--success' : ''}`}>
      {identity.telegramUserId ? identity.telegramUsername ? `Telegram: @${identity.telegramUsername}` : `ID: ${identity.telegramUserId}` : 'Telegram не привязан'}
    </Tag>
    {canWrite && <Button ref={trigger} size="small" loading={busy} onClick={identity.telegramUserId ? () => { setError(undefined); setUnlinkOpen(true) } : () => void issue()}>{identity.telegramUserId ? 'Отвязать' : '✈️ Привязать Telegram'}</Button>}
    {error && !open && !unlinkOpen && <Alert type="error" showIcon message={error} />}
    <Modal title={`Отвязать Telegram · ${name}?`} open={unlinkOpen} destroyOnHidden
      okText="Отвязать" cancelText="Отмена" okButtonProps={{ danger: true, 'aria-label': 'Отвязать', 'aria-busy': busy }} cancelButtonProps={{ disabled: busy, autoFocus: true }} confirmLoading={busy}
      closable={!busy} maskClosable={!busy} keyboard={!busy} onOk={() => void unlink()} onCancel={() => { if (!busy) setUnlinkOpen(false) }} afterClose={() => trigger.current?.focus()}>
      <Typography.Paragraph>Бот перестанет узнавать этот профиль и отправлять ему уведомления.</Typography.Paragraph>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
    </Modal>
    <Modal title={`Привязка Telegram · ${name}`} open={open} footer={null} destroyOnHidden
      closable={busy ? false : { 'aria-label': 'Закрыть' }} maskClosable={!busy} keyboard={!busy} onCancel={() => { setOpen(false); setGrant(undefined); setError(undefined) }} afterClose={() => trigger.current?.focus()}>
      <Typography.Paragraph>Откройте бота @horseclub68_bot и отправьте код или нажмите кнопку ниже.</Typography.Paragraph>
      <Typography.Paragraph type="secondary">Передавайте код только владельцу этого профиля. Код действует 15 минут.</Typography.Paragraph>
      {busy && <Spin aria-label="Получаем код привязки" />}
      {error && <Alert type="error" role="alert" showIcon message={error} />}
      {grant && !expired && <Space direction="vertical" size="middle">
        <Typography.Text copyable={{ text: grant.code }}>Код: <strong>{grant.code}</strong></Typography.Text>
        <Typography.Text type="secondary">Действует до {new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(grant.expiresAt))} (Москва)</Typography.Text>
        <Button ref={node => { telegramLink.current = node }} type="primary" href={grant.deepLink} target="_blank" rel="noopener noreferrer">Открыть в Telegram</Button>
        <Typography.Text role="status" type="secondary">Ожидаем подтверждение в боте…</Typography.Text>
      </Space>}
      {expired && <Alert type="warning" showIcon message="Срок действия кода истёк" />}
      {!busy && (!grant || expired) && <Button onClick={() => void issue()}>Получить новый код</Button>}
    </Modal>
  </Space>
}
