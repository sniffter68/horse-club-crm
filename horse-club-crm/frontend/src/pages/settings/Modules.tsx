import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Card, Col, Modal, Row, Segmented, Space, Spin, Switch, Tabs, Tag, Typography } from 'antd'
import { usePermissions as useRole } from '@refinedev/core'
import { useBeforeUnload, useNavigate } from 'react-router-dom'
import type { Role } from '../../authStorage'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { systemModules, usePermissions, type AccessLevel, type SystemModule } from '../../modulePermissions'

const moduleLabels: Record<SystemModule, string> = {
  SCHEDULE: 'Расписание тренировок', STABLES: 'Конюшня и денники', VETERINARY: 'Ветеринарный учет',
  CASHBOX: 'Касса и финансы', STAFF_PAYROLL: 'Персонал и зарплаты',
}
const descriptions: Record<SystemModule, string> = {
  SCHEDULE: 'Занятия, бронирования и загрузка лошадей.', STABLES: 'Карта денников, заселение и договоры постоя.',
  VETERINARY: 'Процедуры, журнал здоровья и ветеринарные карты.', CASHBOX: 'Платежи, расходы, кассовые смены и отчеты.',
  STAFF_PAYROLL: 'График смен, ставки и расчет начислений сотрудникам.',
}
const roles: Role[] = ['ADMIN', 'MANAGER', 'TRAINER', 'STABLE_WORKER', 'GROOM', 'VET', 'OTHER']
const roleLabels: Record<Role, string> = { GROOM: 'Конюх', VET: 'Ветеринар', OTHER: 'Другое', ADMIN: 'Администратор', MANAGER: 'Управляющий', TRAINER: 'Тренер', STABLE_WORKER: 'Конюх / Сотрудник' }
const options: { value: AccessLevel; label: string }[] = [
  { value: 'FULL', label: 'Полный' }, { value: 'READ_ONLY', label: 'Просмотр' }, { value: 'HIDDEN', label: 'Скрыт' },
]
interface Policy { role: Role; module: SystemModule; accessLevel: AccessLevel }
interface Settings { modules: { module: SystemModule; isEnabled: boolean }[]; permissions: Policy[] }

export function ModulesSettings() {
  const { data: role } = useRole<Role>({})
  return role === 'ADMIN' ? <ModulesEditor /> : <Alert type="warning" message="Модули и права настраивает администратор" />
}
function ModulesEditor() {
  const access = usePermissions()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [data, setData] = useState<Settings>()
  const [draft, setDraft] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [confirmation, setConfirmation] = useState<{ module: SystemModule; isEnabled: boolean } | 'permissions'>()
  const lock = useRef(false)
  const dirty = Boolean(data && JSON.stringify(data.permissions) !== JSON.stringify(draft))
  useBeforeUnload(event => { if (dirty) { event.preventDefault(); event.returnValue = '' } })
  useEffect(() => {
    if (!dirty) return
    let confirming = false
    const protectNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
      const target = new URL(anchor.href)
      if (target.origin !== location.origin || target.href === location.href) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (confirming) return
      confirming = true
      modal.confirm({ title: 'Уйти без сохранения прав?', content: 'Изменения матрицы прав будут потеряны.', okText: 'Уйти без сохранения', cancelText: 'Продолжить настройку', autoFocusButton: 'cancel',
        onOk: () => navigate(`${target.pathname}${target.search}${target.hash}`), afterClose: () => { confirming = false } })
    }
    document.addEventListener('click', protectNavigation, true)
    return () => document.removeEventListener('click', protectNavigation, true)
  }, [dirty, modal, navigate])
  useEffect(() => {
    const controller = new AbortController()
    void httpClient.get<Settings>(`${API_URL}/settings/modules`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setData(data); setDraft(data.permissions); setError(undefined) } })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  async function save() {
    if (lock.current || !confirmation) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      if (confirmation === 'permissions') {
        const { data: saved } = await httpClient.put<Settings>(`${API_URL}/settings/modules/permissions`, { permissions: draft })
        setData(saved); setDraft(saved.permissions)
      } else {
        await httpClient.patch(`${API_URL}/settings/modules/toggle`, confirmation)
        setData(current => current && ({ ...current, modules: current.modules.map(row => row.module === confirmation.module ? { ...row, isEnabled: confirmation.isEnabled } : row) }))
      }
      setConfirmation(undefined)
      await access.refresh()
      window.dispatchEvent(new Event('module-permissions-changed'))
      void message.success('Настройки доступа сохранены')
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Typography.Title level={2}>Модули и права доступа</Typography.Title>
    <Typography.Paragraph type="secondary">Отключение модуля закрывает раздел для всего клуба. Данные сохраняются и снова доступны после включения.</Typography.Paragraph>
    {error && <Alert role="alert" type="error" showIcon message={error} action={!data && <Button disabled={loading} onClick={() => { setLoading(true); setRevision(value => value + 1) }}>Повторить</Button>} />}
    {loading ? <div className="loading-page"><Spin aria-label="Загрузка настроек модулей" /></div> : data && <Tabs items={[
      { key: 'modules', label: 'Модули клуба', children: <Row gutter={[16, 16]}>{systemModules.map(module => {
        const enabled = data.modules.find(row => row.module === module)?.isEnabled ?? false
        return <Col key={module} xs={24} md={12} xl={8}><Card title={moduleLabels[module]} extra={<Switch aria-label={moduleLabels[module]} checked={enabled} disabled={busy || dirty} onChange={isEnabled => setConfirmation({ module, isEnabled })} />}>
          <Typography.Paragraph>{descriptions[module]}</Typography.Paragraph><Tag>{enabled ? 'Включен' : 'Выключен'}</Tag>
        </Card></Col>
      })}</Row> },
      { key: 'permissions', label: 'Матрица прав ролей', children: <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert type="info" showIcon message="Администратор всегда имеет полный доступ. Отключенный модуль недоступен всем ролям." description="Полный — просмотр и изменение; Просмотр — без редактирования; Скрыт — раздел недоступен. Права действуют вместе с ограничениями операций: тренер работает со своими занятиями, выплаты и удаление защищены отдельно." />
        <div style={{ overflowX: 'auto' }}><table className="module-permissions-table"><caption>Уровни доступа сотрудников к модулям клуба</caption><thead><tr><th scope="col">Роль</th>{systemModules.map(module => <th scope="col" key={module}>{moduleLabels[module]}{!data.modules.find(row => row.module === module)?.isEnabled && <Tag>Выключен</Tag>}</th>)}</tr></thead>
          <tbody>{roles.map(role => <tr key={role}><th scope="row">{roleLabels[role]}</th>{systemModules.map(module => <td key={module}><Segmented<AccessLevel> aria-label={`${roleLabels[role]}: ${moduleLabels[module]}`} value={draft.find(row => row.role === role && row.module === module)?.accessLevel} disabled={busy || role === 'ADMIN'} options={options} onChange={accessLevel => setDraft(current => current.map(row => row.role === role && row.module === module ? { ...row, accessLevel } : row))} /></td>)}</tr>)}</tbody></table></div>
        <Space wrap><Button type="primary" disabled={!dirty || busy} onClick={() => setConfirmation('permissions')}>Сохранить изменения</Button><Button disabled={!dirty || busy} onClick={() => setDraft(data.permissions)}>Отменить изменения</Button>{dirty && <Typography.Text>Есть несохраненные изменения. Сохраните их перед переключением модулей.</Typography.Text>}</Space>
      </Space> },
    ]} />}
    <Modal open={Boolean(confirmation)} title={confirmation === 'permissions' ? 'Сохранить права ролей?' : confirmation?.isEnabled ? 'Включить модуль?' : 'Отключить модуль?'}
      onCancel={() => { if (!busy) setConfirmation(undefined) }} onOk={() => void save()} confirmLoading={busy} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={false} okText="Сохранить" cancelText="Отмена">
      <p>{confirmation === 'permissions' ? 'Новые права будут применяться к сотрудникам клуба при следующих запросах.' : confirmation && `${moduleLabels[confirmation.module]}: ${confirmation.isEnabled ? 'раздел снова станет доступен согласно правам ролей.' : 'раздел и его API станут недоступны всем сотрудникам, включая администратора. Данные сохранятся.'}`}</p>
      {error && <Alert type="error" message={error} />}
    </Modal>
  </Space>
}
