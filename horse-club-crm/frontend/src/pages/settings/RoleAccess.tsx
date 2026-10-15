import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Col, Form, Result, Row, Select, Space, Spin, Switch, Typography } from 'antd'
import { usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'
import type { RolePermissions } from '../../access'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { catalog } from '../catalogs/loadCatalog'
import type { Trainer } from '../catalogs/types'

type Policy = RolePermissions & { role: 'ADMIN' | 'TRAINER' }
type User = { id: string; email: string; role: Role; trainerId: string | null }
const permissions: [keyof RolePermissions, string][] = [
  ['horseReplaceOwn', 'Замена лошади в своих занятиях'], ['horseReplaceAny', 'Замена лошади в любых занятиях'],
  ['healthRead', 'Просмотр журнала здоровья'], ['healthWrite', 'Редактирование журнала здоровья'],
  ['financeRead', 'Доступ к финансовым отчётам'], ['boardingAccess', 'Доступ к разделу постоя'],
]

export function RoleAccessPage() {
  const { data: role } = usePermissions<Role>({})
  if (role !== 'ADMIN') return <Result status="403" title="Роли и доступ настраивает администратор" />
  return <RoleAccessEditor />
}

function RoleAccessEditor() {
  const { message, modal } = App.useApp()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const [form] = Form.useForm<RolePermissions>()
  const [binding] = Form.useForm<{ userId: string; trainerId: string | null }>()
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([httpClient.get<Policy[]>(`${API_URL}/settings/role-access`, { signal: controller.signal }),
      catalog<User>('users', controller.signal), catalog<Trainer>('trainers', controller.signal)])
      .then(([response, accounts, staff]) => {
        if (controller.signal.aborted) return
        if (!Array.isArray(response.data) || !['ADMIN', 'TRAINER'].every(role => response.data.some(policy => policy.role === role && permissions.every(([key]) => typeof policy[key] === 'boolean')))) {
          throw new Error('Не удалось прочитать права ролей. Повторите загрузку.')
        }
        setPolicies(response.data); setUsers(accounts); setTrainers(staff)
        form.setFieldsValue(response.data.find(policy => policy.role === 'TRAINER')!)
      }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [form, revision])
  async function write(action: () => Promise<unknown>, success: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      await action(); void message.success(success)
      window.dispatchEvent(new Event('role-access-changed'))
      setLoading(true)
      setRevision(value => value + 1)
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Typography.Title level={3}>Роли и доступ</Typography.Title>
    <Typography.Paragraph type="secondary">Права администратора и менеджера сохраняются. Финансовые отчёты дают доступ к просмотру; касса и изменение оплат остаются у администратора и менеджера. Доступ к постою не выдаёт тренеру права изменять договоры.</Typography.Paragraph>
    {error && <Alert type="error" showIcon role="alert" message={error} action={<Button disabled={busy || loading} onClick={() => { setLoading(true); setError(undefined); setRevision(value => value + 1) }}>Повторить загрузку</Button>} />}
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}><Card title="Администратор">
          <Space direction="vertical" style={{ width: '100%' }}>{permissions.map(([key, label]) => <Space key={key} wrap>
            <Switch checked={policies.find(policy => policy.role === 'ADMIN')?.[key] ?? true} disabled aria-label={`Администратор: ${label}`} /><span>{label}</span>
          </Space>)}</Space>
          <Typography.Paragraph type="secondary">Полный доступ закреплён системной политикой.</Typography.Paragraph>
        </Card></Col>
        <Col xs={24} lg={12}><Card title="Тренер">
          <Form noValidate form={form} layout="vertical" disabled={busy || loading || !policies.length}
            onFinish={values => modal.confirm({ title: 'Изменить права роли «Тренер»?', content: 'Изменения распространятся на все учётные записи тренеров.', okText: 'Сохранить права', cancelText: 'Отмена',
              onOk: () => write(() => httpClient.patch(`${API_URL}/settings/role-access/TRAINER`, values), 'Права роли сохранены') })}>
            {permissions.map(([key, label]) => <Form.Item key={key} name={key} label={label} valuePropName="checked"
              rules={key === 'healthWrite' ? [{ validator: (_, value) => !value || form.getFieldValue('healthRead') ? Promise.resolve() : Promise.reject(new Error('Сначала включите просмотр журнала здоровья')) }] : []} dependencies={key === 'healthWrite' ? ['healthRead'] : []}>
              <Switch aria-label={`Тренер: ${label}`} disabled={key === 'horseReplaceAny' || busy || loading} />
            </Form.Item>)}
            <Button type="primary" htmlType="submit" loading={busy}>Сохранить права</Button>
          </Form>
        </Card></Col>
      </Row>
    </Spin>
    <Card title={<span style={{ whiteSpace: 'normal' }}>Привязка учётной записи к тренеру</span>}>
      <Typography.Paragraph>Для замены лошади в своих занятиях учётная запись должна быть связана с тренером из расписания. Один тренер привязывается к одной учётной записи. После изменения привязки пользователю потребуется войти заново.</Typography.Paragraph>
      <Form form={binding} noValidate layout="vertical" disabled={busy || loading || !policies.length}
        onFinish={values => modal.confirm({ title: 'Изменить привязку тренера?', content: 'Текущие сессии этой учётной записи будут отозваны.', okText: 'Сохранить привязку', cancelText: 'Отмена',
          onOk: () => write(() => httpClient.patch(`${API_URL}/users/${values.userId}/trainer`, { trainerId: values.trainerId ?? null }), 'Привязка тренера сохранена') })}>
        <Form.Item name="userId" label="Учётная запись тренера" rules={[{ required: true, message: 'Выберите учётную запись' }]}>
          <Select aria-label="Учётная запись тренера" showSearch optionFilterProp="label" options={users.filter(user => user.role === 'TRAINER').map(user => ({ value: user.id, label: user.email }))}
            onChange={id => binding.setFieldValue('trainerId', users.find(user => user.id === id)?.trainerId ?? null)} />
        </Form.Item>
        <Form.Item name="trainerId" label="Тренер в расписании">
          <Select aria-label="Тренер в расписании" allowClear showSearch optionFilterProp="label" placeholder="Без привязки" options={trainers.map(trainer => ({ value: trainer.id, label: trainer.fullName || trainer.name }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>Сохранить привязку</Button>
      </Form>
    </Card>
  </Space>
}
