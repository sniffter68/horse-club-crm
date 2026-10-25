import { useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, App, Button, Form, Input, Space, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../httpClient'
import { EntryOverlay } from './EntryOverlay'
import { isUuid } from '../uuid'
import { vkProfilePayload, vkProfileUrl } from './vkProfile'

type ProfileProps = { id: string; name: string; vkId?: string | null; vkUserId?: string | null; kind: 'CLIENT' | 'TRAINER' | 'STAFF'; readOnly?: boolean }

export function VkIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.8 17.5C6.7 17.5 3.2 13.3 3 6.5h3.1c.2 5 2.4 7.1 4.1 7.6V6.5h2.9v4.4c1.7-.2 3.5-2.2 4.1-4.4h2.9c-.5 2.7-2.5 4.7-3.9 5.5 1.4.7 3.7 2.5 4.6 5.5h-3.2c-.7-2.1-2.3-3.8-4.6-4v4h-.2Z" /></svg>
}

export function VkProfileField({ initialValue }: { initialValue?: string | null }) {
  return <Form.Item name="vkId" label="VK ID или ссылка на страницу" initialValue={initialValue}
    extra="Например, 12345678 или vk.com/username. Очистите поле, чтобы снять привязку."
    rules={[{ max: 256, message: 'Не более 256 символов' }]}>
    <Input prefix={<VkIcon />} placeholder="vk.com/id12345678" maxLength={256} autoComplete="off" />
  </Form.Item>
}

export function VkProfileLink({ id, name, vkId, vkUserId, kind, readOnly }: ProfileProps) {
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ vkId: string }>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const linkedId = vkId || vkUserId
  const profileUrl = vkProfileUrl(linkedId)
  const resource = kind === 'CLIENT' ? 'clients' : kind === 'TRAINER' ? 'trainers' : 'users'
  const close = () => { if (!busy) setOpen(false) }
  const save = async ({ vkId: input }: { vkId: string }) => {
    if (busy) return
    if (!isUuid(id)) { setError('Некорректный идентификатор. Обновите страницу.'); return }
    setBusy(true); setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/${resource}/${id}${kind === 'TRAINER' ? '/vk' : ''}`, vkProfilePayload(input))
      await invalidate({ resource, id, invalidates: ['list', 'detail'] })
      void message.success(input?.trim() ? 'VK привязан' : 'Привязка VK снята')
      setOpen(false)
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { setBusy(false) }
  }
  return <Space direction="vertical" size={4} className="vk-profile">
    <Tag className={`crm-tag ${linkedId ? 'vk-chip--connected' : 'vk-chip--disconnected'}`}>{linkedId ? 'VK привязан' : 'VK не привязан'}</Tag>
    {profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer">Страница ВКонтакте ↗</a>}
    {!readOnly && <Button ref={triggerRef} size="small" icon={<VkIcon />} onClick={() => { form.setFieldsValue({ vkId: linkedId || '' }); setError(undefined); setOpen(true) }}>{linkedId ? 'Изменить VK' : 'Привязать VK'}</Button>}
    <EntryOverlay variant="drawer" title={`Привязка VK · ${name}`} open={open} onCancel={close} destroyOnHidden
      closable={!busy} maskClosable={!busy} keyboard={!busy} confirmLoading={busy} cancelButtonProps={{ disabled: busy }} onOk={() => form.submit()} afterClose={() => triggerRef.current?.focus()}>
      <Typography.Paragraph>Укажите страницу клиента или сотрудника. Бот узнает его по VK ID при первом сообщении в сообщество клуба.</Typography.Paragraph>
      <Form form={form} layout="vertical" noValidate onFinish={values => void save(values)} disabled={busy}>
        <VkProfileField />
      </Form>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
    </EntryOverlay>
  </Space>
}

export function VkAdminRecipient(props: Omit<ProfileProps, 'kind'>) {
  return <VkProfileLink {...props} kind="STAFF" />
}
