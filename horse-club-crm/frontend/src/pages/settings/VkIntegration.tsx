import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { Alert, App, Button, Card, Form, Input, Space, Spin, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

type Status = { communityId: string; callbackUrl: string; configured: boolean; hasAccessToken: boolean; hasConfirmationToken: boolean; hasSecretKey: boolean }
type Values = { communityId: string; accessToken?: string; confirmationToken?: string; secretKey?: string }
const secrets = [
  ['accessToken', 'Токен доступа', 'hasAccessToken'],
  ['confirmationToken', 'Ключ подтверждения', 'hasConfirmationToken'],
  ['secretKey', 'Секретный ключ', 'hasSecretKey'],
] as const

function SecretInput({ value, onChange, label, ...inputProps }: Omit<ComponentProps<typeof Input>, 'onChange'> & { onChange?: (value: string) => void; label: string }) {
  const [visible, setVisible] = useState(false)
  return <Input {...inputProps} value={value} onChange={event => onChange?.(event.target.value)} type={visible ? 'text' : 'password'} autoComplete="new-password"
    suffix={<Button size="small" type="text" disabled={inputProps.disabled} aria-label={`${visible ? 'Скрыть' : 'Показать'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Скрыть' : 'Показать'}</Button>} />
}

export function VkIntegration() {
  const [form] = Form.useForm<Values>()
  const { message } = App.useApp()
  const [status, setStatus] = useState<Status>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'check'>()
  const busyRef = useRef(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<string>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    httpClient.get<Status>(`${API_URL}/settings/vk`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) { setStatus(data); form.setFieldsValue({ communityId: data.communityId }) }
    }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [form, revision])

  async function run(action: 'save' | 'check') {
    if (busyRef.current || !status) return
    let values: Values
    try { values = await form.validateFields() } catch { form.scrollToField('communityId', { focus: true }); return }
    busyRef.current = true; setBusy(action); setError(undefined); setResult(undefined)
    try {
      if (action === 'check') {
        const { data } = await httpClient.post<{ message: string }>(`${API_URL}/settings/vk/check`, values)
        setResult(data.message)
      } else {
        const { data } = await httpClient.patch<Status>(`${API_URL}/settings/vk`, values)
        setStatus(data); form.resetFields(); form.setFieldValue('communityId', data.communityId)
        void message.success('Настройки VK сохранены')
      }
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { busyRef.current = false; setBusy(undefined) }
  }

  return <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
    <Typography.Title level={2}>Интеграция VK</Typography.Title>
    <Tag color={status?.configured ? 'success' : 'default'}>{status?.configured ? 'Бот настроен' : 'Бот не настроен'}</Tag>
    <Typography.Paragraph>URL для Callback API:<br /><Typography.Text style={{ overflowWrap: 'anywhere' }}>{status?.callbackUrl || 'https://crm.horseclub68.ru/api/vk/callback'}</Typography.Text></Typography.Paragraph>
    {error && <Alert role="alert" type="error" showIcon message={error} action={!status && <Button onClick={() => { setError(undefined); setLoading(true); setRevision(value => value + 1) }} disabled={loading}>Повторить</Button>} />}
    {result && <Alert role="status" type="success" showIcon message="Подключение проверено" description={result} />}
    <Card><Spin spinning={loading}>
      <Form noValidate form={form} layout="vertical" disabled={!status || loading || Boolean(busy)} onFinish={() => run('save')} onValuesChange={() => setResult(undefined)}>
        <Form.Item name="communityId" label="ID сообщества" rules={[{ required: true, message: 'Укажите ID сообщества' }, { pattern: /^[1-9]\d{0,14}$/, message: 'Введите числовой ID без знака минус' }]}>
          <Input inputMode="numeric" autoComplete="off" />
        </Form.Item>
        {secrets.map(([name, label, flag]) => <Form.Item key={name} name={name} label={label} extra={status?.[flag] ? 'Сохранён. Оставьте поле пустым, чтобы сохранить прежнее значение.' : undefined}
          rules={[{ required: !status?.[flag], whitespace: true, message: `Укажите ${label.toLowerCase()}` }]}>
          <SecretInput label={label} disabled={!status || loading || Boolean(busy)} />
        </Form.Item>)}
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={busy === 'save'}>Сохранить</Button>
          <Button onClick={() => run('check')} loading={busy === 'check'}>Проверить подключение</Button>
        </Space>
      </Form>
    </Spin></Card>
    <Typography.Paragraph type="secondary">После сохранения подтвердите адрес в настройках сообщества VK и включите события message_new и message_event. Проверка подключения не отправляет сообщения участникам.</Typography.Paragraph>
  </Space>
}
