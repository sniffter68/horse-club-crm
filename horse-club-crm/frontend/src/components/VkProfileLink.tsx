import { useEffect, useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, Button, Input, Modal, Popconfirm, Skeleton, Space, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../httpClient'

type Invite = { code: string; expiresAt: string; instruction: string; communityUrl: string | null }
type ProfileProps = { id: string; name: string; vkUserId?: string | null; kind: 'CLIENT' | 'TRAINER' }

export function VkProfileLink({ id, name, vkUserId, kind }: ProfileProps) {
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const resource = kind === 'CLIENT' ? 'clients' : 'trainers'
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [invite, setInvite] = useState<Invite>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!open || !invite) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open, invite])
  const refresh = () => invalidate({ resource, id, invalidates: ['list', 'detail'] })
  const close = () => {
    request.current?.abort()
    setBusy(false)
    setOpen(false)
    void refresh()
  }
  const issue = async () => {
    if (busy) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setOpen(true)
    setInvite(undefined)
    setError(undefined)
    setBusy(true)
    try {
      const { data } = await httpClient.post<Invite>(`${API_URL}/vk/link-codes`, { kind, id }, { signal: controller.signal })
      if (!controller.signal.aborted) { setInvite(data); setNow(Date.now()) }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const failure = toHttpError(cause)
        setError(failure.message)
        if (failure.statusCode === 401) onError(failure)
      }
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const unlink = async () => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await httpClient.post(`${API_URL}/vk/link-codes/unlink`, { kind, id })
      setInvite(undefined)
      await refresh()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { setBusy(false) }
  }
  const expired = invite && new Date(invite.expiresAt).getTime() <= now
  return <div className="vk-profile">
    <Tag className={`crm-tag ${vkUserId ? 'vk-chip--connected' : 'vk-chip--disconnected'}`}>{vkUserId ? 'VK подключён' : 'VK не привязан'}</Tag>
    {vkUserId ? <Popconfirm title={`Отвязать VK · ${name}?`} description="Уведомления и доступ через бота будут отключены."
      open={confirmOpen} onOpenChange={next => { if (!busy) setConfirmOpen(next) }}
      okText="Отвязать" cancelText="Оставить" cancelButtonProps={{ disabled: busy }}
      onConfirm={async () => { await unlink(); setConfirmOpen(false) }} onCancel={() => setConfirmOpen(false)}>
      <Button size="small" aria-label="Отвязать VK" loading={busy} onClick={() => setConfirmOpen(true)}>Отвязать VK</Button>
    </Popconfirm> : <Button size="small" aria-label="Привязать VK" loading={busy} onClick={() => void issue()}>Привязать VK</Button>}
    {error && !open && <Alert type="error" showIcon message={error} />}
    <Modal title={`Привязать VK · ${name}`} open={open} onCancel={close} destroyOnHidden
      footer={<Button onClick={close}>Готово, обновить статус</Button>}>
      {busy && <Skeleton active paragraph={{ rows: 3 }} />}
      {error && <Space direction="vertical"><Alert type="error" showIcon message="Не удалось получить код" description={error} />
        <Button onClick={() => void issue()}>Повторить</Button></Space>}
      {invite && !busy && <Space direction="vertical" size="middle" className="vk-invite">
        {expired ? <Alert type="warning" showIcon message="Срок действия кода истёк" /> : <>
          <Typography.Paragraph>Отправьте этот 4-значный код боту сообщества:</Typography.Paragraph>
          <Typography.Paragraph className="vk-invite-code data-mono" copyable={{ text: invite.code }}>{invite.code}</Typography.Paragraph>
          <Typography.Text type="secondary">Код действует до {new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(invite.expiresAt))} (МСК).</Typography.Text>
          <Typography.Paragraph>Для подтверждения телефона бот попросит отправить команду:</Typography.Paragraph>
          <Typography.Paragraph className="vk-invite-command data-mono" copyable={{ text: invite.instruction }}>{invite.instruction}</Typography.Paragraph>
          {invite.communityUrl ? <a href={invite.communityUrl} target="_blank" rel="noopener noreferrer">Открыть бота в VK ↗</a>
            : <Typography.Text type="secondary">Напишите боту сообщества клуба. Ссылку на сообщество можно уточнить у администратора.</Typography.Text>}
        </>}
        <Button onClick={() => void issue()}>Получить новый код</Button>
      </Space>}
    </Modal>
  </div>
}

export function VkAdminRecipient({ id, vkUserId, name }: Omit<ProfileProps, 'kind'>) {
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(vkUserId || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const save = async () => {
    if (busy || (value && !/^[1-9]\d{0,14}$/.test(value))) return
    setBusy(true)
    setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/users/${id}/vk`, { vkUserId: value || null })
      await invalidate({ resource: 'users', invalidates: ['list'] })
      setOpen(false)
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { setBusy(false) }
  }
  return <>
    <Button size="small" onClick={() => { setValue(vkUserId || ''); setError(undefined); setOpen(true) }}>{vkUserId ? 'VK уведомления подключены' : 'Настроить VK уведомления'}</Button>
    <Modal title={`Уведомления о заявках · ${name}`} open={open} onCancel={() => { if (!busy) setOpen(false) }}
      closable={!busy} maskClosable={!busy} keyboard={!busy} okText="Сохранить" cancelText="Закрыть"
      confirmLoading={busy} okButtonProps={{ disabled: Boolean(value && !/^[1-9]\d{0,14}$/.test(value)) }} onOk={() => void save()}>
      <Typography.Paragraph>Укажите числовой ID VK администратора. Для получения уведомлений он должен разрешить сообщения сообщества. Очистите поле, чтобы отключить доставку.</Typography.Paragraph>
      <label htmlFor={`vk-admin-${id}`}>ID пользователя VK</label>
      <Input id={`vk-admin-${id}`} inputMode="numeric" value={value} onChange={event => setValue(event.target.value.trim())} placeholder="Например, 123456789"
        aria-invalid={Boolean(value && !/^[1-9]\d{0,14}$/.test(value))} aria-describedby={`vk-admin-help-${id}`} />
      <Typography.Paragraph id={`vk-admin-help-${id}`} type="secondary">Только цифры: от 1 до 15 знаков, без нуля в начале.</Typography.Paragraph>
      {error && <Alert type="error" showIcon message={error} />}
    </Modal>
  </>
}
