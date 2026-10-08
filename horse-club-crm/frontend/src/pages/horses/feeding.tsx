import { useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, App, Button, Form, Input, Space, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Horse } from '../catalogs/types'

const FeedingField = Form.Item

export function HorseFeeding({ horse, disabled }: { horse: Horse; disabled: boolean }) {
  const { canManage } = useCatalogPermissions()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm<{ feedingNotes: string }>()
  const lock = useRef(false)
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const { message } = App.useApp()
  const cancel = () => { if (!lock.current) { setEditing(false); setError(undefined) } }
  const save = async ({ feedingNotes }: { feedingNotes: string }) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      await httpClient.patch(`${API_URL}/horses/${horse.id}`, { feedingNotes: feedingNotes.trim() || null })
      await invalidate({ resource: 'horses', invalidates: ['all'] })
      setEditing(false)
      void message.success('Режим кормления сохранён')
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { lock.current = false; setBusy(false) }
  }
  return <section className="horse-feeding" aria-label="Режим кормления">
    <Typography.Title level={5}>Режим кормления</Typography.Title>
    {editing ? <Form form={form} noValidate layout="vertical" disabled={busy} onFinish={save}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancel() } }}>
      <FeedingField name="feedingNotes" label="Рацион, подкормки и особенности"
        rules={[{ max: 5000, message: 'Не более 5000 символов' }]}>
        <Input.TextArea aria-label="Рацион, подкормки и особенности" autoFocus autoSize={{ minRows: 5, maxRows: 14 }}
          maxLength={5000} showCount placeholder={'Утро: …\nДень: …\nВечер: …\nСено, подкормки и особенности: …'} />
      </FeedingField>
      {error && <Alert type="error" showIcon message="Не удалось сохранить режим кормления" description={error} />}
      <Space wrap className="horse-feeding-actions">
        <Button type="primary" htmlType="submit" loading={busy} className="quick-boarding-primary">Сохранить кормление</Button>
        <Button disabled={busy} onClick={cancel}>Отмена</Button>
      </Space>
    </Form> : <>
      <Typography.Paragraph className="horse-feeding-notes" type={horse.feedingNotes ? undefined : 'secondary'}>
        {horse.feedingNotes || 'Режим кормления пока не указан.'}
      </Typography.Paragraph>
      {canManage && <Button size="small" disabled={disabled} onClick={() => {
        form.setFieldsValue({ feedingNotes: horse.feedingNotes || '' }); setError(undefined); setEditing(true)
      }}>Редактировать кормление</Button>}
    </>}
  </section>
}
