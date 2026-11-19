import { useEffect, useState } from 'react'
import { usePermissions as useRole } from '@refinedev/core'
import { Button, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { usePermissions } from '../../modulePermissions'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { isUuid } from '../../uuid'
import { StableEntryModal } from '../stable/shared'
import type { Trainer } from '../catalogs/types'
import { catalog } from '../catalogs/loadCatalog'

type AccountValues = { email?: string; password?: string; userId?: string }
type Candidate = { id: string; email: string; role: string; trainerId: string | null }

export function TrainerAccessStatus({ trainer }: { trainer: Trainer }) {
  return <Tag color={trainer.user?.crmAccess ? 'success' : 'default'}>Доступ в CRM: {trainer.user?.crmAccess ? 'активен' : trainer.user ? 'отключён' : 'не выдан'}</Tag>
}

function AccountDrawer({ trainer, mode, onClose }: { trainer: Trainer; mode: 'create' | 'link'; onClose: () => void }) {
  const [form] = Form.useForm<AccountValues>()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(mode === 'link')
  const [error, setError] = useState<string>()
  const [version, retry] = useState(0)
  useEffect(() => {
    if (mode !== 'link') return
    const controller = new AbortController()
    void catalog<Candidate>('users', controller.signal).then(rows => {
      if (!controller.signal.aborted) setCandidates(rows)
    }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mode, version])
  return <StableEntryModal variant="drawer" title={mode === 'create' ? 'Выдать доступ в CRM' : 'Привязать учётку'} form={form}
    submitLabel={mode === 'create' ? 'Создать логин' : 'Привязать учётку'} submitDisabled={mode === 'link' && (loading || !!error)}
    resources={['trainers', 'users', 'staff']} onClose={onClose} onSaved={onClose} successMessage="Учётная запись привязана к тренеру"
    save={values => {
      if (!isUuid(trainer.id) || (values.userId && !isUuid(values.userId))) throw new Error('Некорректный идентификатор')
      return httpClient.post(`${API_URL}/trainers/${trainer.id}/account`, mode === 'link' ? { userId: values.userId } : { email: values.email, password: values.password })
    }}>
    <Typography.Paragraph>{trainer.name}. Занятия и начисления сохранятся в этой карточке.</Typography.Paragraph>
    {mode === 'link' ? <>
      {error && <Typography.Paragraph type="danger">{error} <Button onClick={() => { setError(undefined); setLoading(true); retry(value => value + 1) }}>Повторить</Button></Typography.Paragraph>}
      <Form.Item name="userId" label="Учётная запись тренера" rules={[{ required: true, message: 'Выберите учётную запись' }]}>
        <Select aria-label="Учётная запись тренера" virtual={false} loading={loading} showSearch optionFilterProp="label"
          options={candidates.filter(user => user.role === 'TRAINER' && !user.trainerId).map(user => ({ value: user.id, label: user.email }))} />
      </Form.Item>
    </> : <>
      <Form.Item name="email" label="Email для входа" rules={[{ required: true, type: 'email', message: 'Укажите корректный email' }]}><Input autoComplete="off" maxLength={320} /></Form.Item>
      <Form.Item name="password" label="Временный пароль" rules={[{ required: true, min: 12, max: 72, message: 'От 12 до 72 символов' }]}><Input.Password autoComplete="new-password" /></Form.Item>
    </>}
  </StableEntryModal>
}

export function TrainerAccount({ trainer }: { trainer: Trainer }) {
  const { data: role } = useRole<string>({})
  const modules = usePermissions()
  const [mode, setMode] = useState<'create' | 'link'>()
  return <>
    <Space wrap><TrainerAccessStatus trainer={trainer} />{trainer.user?.email && <Typography.Text>{trainer.user.email}</Typography.Text>}
      {role === 'ADMIN' && modules.canWrite('STAFF_PAYROLL') && !trainer.user?.crmAccess && trainer.isActive !== false && <>
        <Button onClick={() => setMode('create')}>Выдать доступ (создать логин)</Button>
        {!trainer.user && <Button onClick={() => setMode('link')}>Привязать учётку</Button>}
      </>}
    </Space>
    {mode && <AccountDrawer trainer={trainer} mode={mode} onClose={() => setMode(undefined)} />}
  </>
}
