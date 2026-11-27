import { useLogin } from '@refinedev/core'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import type { LoginCredentials } from '../../authProvider'
import { EquestrianMotif } from '../../components/EquestrianMotif'
import { useDemoStatus, type DemoRole } from '../../useDemoStatus'

export function LoginPage() {
  const isDemo = useDemoStatus()
  const { mutate: login, isPending, data, error } = useLogin<LoginCredentials>()
  const message = error?.message ?? (data?.success === false ? data.error?.message : undefined)
  return (
    <main className="login-page">
      <EquestrianMotif horse />
      <Card className="login-card">
        <Typography.Title level={2}>Вход в Horse CRM</Typography.Title>
        {message && <Alert type="error" showIcon message={message} className="login-error" />}
        <Form<LoginCredentials> noValidate layout="vertical" requiredMark={false} onFinish={(values) => login(values)} disabled={isPending}>
          <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Введите корректный email' }]}>
            <Input autoComplete="username" type="email" size="large" autoFocus />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" loading={isPending} block>Войти</Button>
        </Form>
        {isDemo && <section className="demo-login" aria-label="Быстрый вход на демо-стенд">
          <Typography.Title level={5}>Демо-стенд · вход в один клик</Typography.Title>
          {([['OWNER', 'Владелец клуба'], ['ADMIN', 'Администратор'], ['TRAINER', 'Тренер']] satisfies [DemoRole, string][])
            .map(([role, label]) => <Button key={role} block disabled={isPending} onClick={() => login({ demoRole: role })}>{label}</Button>)}
        </section>}
      </Card>
    </main>
  )
}
