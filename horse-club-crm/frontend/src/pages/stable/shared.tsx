import { useRef, useState, type ReactNode } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { Alert, App, Button, Empty, Form, Modal, Pagination, Space, Spin, type FormInstance } from 'antd'
import { toHttpError } from '../../httpClient'
export function StableListState({ loading, error, total, page, onPage, refresh, children }: {
  loading: boolean; error?: string; total: number; page: number; onPage: (page: number) => void; refresh: () => void; children: ReactNode
}) {
  return <>
    <Button size="small" disabled={loading} onClick={refresh}>{error ? 'Повторить' : 'Обновить'}</Button>
    {loading ? <div className="stable-loading"><Spin aria-label="Загрузка журнала" /></div>
      : error ? <Alert type="error" showIcon message="Не удалось загрузить журнал" description={error} />
      : !total ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Записей пока нет" /> : <>{children}
        <Pagination current={page} total={total} pageSize={20} showSizeChanger={false} onChange={onPage} simple /></>}
  </>
}
export function StableEntryModal<T extends object>({ title, form, submitLabel, onClose, onSaved, save, children, resources = ['horses', 'clients', 'boarding-contracts'], successMessage = 'Запись сохранена' }: {
  title: string; form: FormInstance<T>; submitLabel: string; onClose: () => void; onSaved: () => void;
  save: (values: T) => Promise<unknown>; children: ReactNode
  resources?: string[]; successMessage?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const lock = useRef(false)
  const { modal, message } = App.useApp()
  const invalidate = useInvalidate()
  const { mutate: onError } = useOnError()
  const close = () => {
    if (lock.current) return
    if (form.isFieldsTouched()) modal.confirm({ title: 'Закрыть без сохранения?', content: 'Введённые данные будут потеряны.',
      okText: 'Закрыть', cancelText: 'Продолжить заполнение', onOk: onClose })
    else onClose()
  }
  const submit = async (values: T) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(undefined)
    try {
      await save(values)
      await Promise.all(resources.map(resource => invalidate({ resource, invalidates: ['all'] })))
      onSaved(); void message.success(successMessage)
    } catch (cause) {
      const failure = toHttpError(cause); setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { lock.current = false; setBusy(false) }
  }
  return <Modal open title={title} className="stable-entry-modal" width={520} onCancel={close}
    maskClosable={!busy} keyboard={!busy} closable={!busy} footer={<Space wrap>
      <Button onClick={close} disabled={busy}>Закрыть</Button>
      <Button type="primary" loading={busy} onClick={() => form.submit()}>{submitLabel}</Button>
    </Space>}>
    <Form form={form} layout="vertical" noValidate disabled={busy} onFinish={submit} scrollToFirstError>{children}</Form>
    {error && <Alert type="error" showIcon message="Запись не сохранена" description={error} />}
  </Modal>
}
