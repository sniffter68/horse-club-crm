import { Create, useForm } from '@refinedev/antd'
import { usePermissions, type BaseRecord, type HttpError } from '@refinedev/core'
import { Form, Input, Result, Select, Spin } from 'antd'
import type { Role } from '../../authStorage'

type UserValues = { email: string; password: string; role: Role }
export function UserCreate() {
  const { data: actorRole, isLoading } = usePermissions<Role>({})
  const { formProps, saveButtonProps } = useForm<BaseRecord, HttpError, UserValues>({ resource: 'users', action: 'create', redirect: 'list' })
  if (isLoading) return <Spin />
  if (actorRole !== 'ADMIN') return <Result status="403" title="Недостаточно прав" />
  return <Create title="Новый пользователь" saveButtonProps={saveButtonProps}>
    <Form<UserValues> {...formProps} layout="vertical">
      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
      <Form.Item name="password" label="Пароль" rules={[{ required: true, min: 12, message: 'Минимум 12 символов' }]}><Input.Password autoComplete="new-password" /></Form.Item>
      <Form.Item name="role" label="Роль" rules={[{ required: true }]}><Select options={['ADMIN', 'MANAGER', 'TRAINER'].map(value => ({ value, label: value }))} /></Form.Item>
    </Form>
  </Create>
}
