import { useRef, useState } from 'react'
import { useList, useInvalidate } from '@refinedev/core'
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Segmented, Select, Space } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClientSelectWithCreate } from '../../components/ClientSelectWithCreate'
import { EntryOverlay } from '../../components/EntryOverlay'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { usePermissions } from '../../modulePermissions'
import { isUuid } from '../../uuid'
import { useCatalogPermissions } from '../catalogs/permissions'
import { money } from '../catalogs/format'
import { toInstant } from '../schedule/time'
import { MembershipList } from './list'

type Service = { id: string; title: string; name: string; price: string | number; allowMembership: boolean }
type Plan = { id: string; name: string; totalLessons: number; validDays: number }
type Values = { clientId: string; serviceId: string; pricingPlanId?: string; totalLessons: number; totalPrice: number; paymentMethod: 'CASH' | 'CARD'; validUntil: Dayjs; reason?: string }

export function MembershipCreate() {
  const [form] = Form.useForm<Values>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const invalidate = useInvalidate()
  const access = usePermissions()
  const { canManage } = useCatalogPermissions()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string>()
  const pending = useRef<Record<string, unknown> | null>(null)
  const services = useList<Service>({ resource: 'services', pagination: { mode: 'off' }, errorNotification: false, queryOptions: { retry: false } })
  const plans = useList<Plan>({ resource: 'pricing-plans', pagination: { mode: 'off' }, errorNotification: false, queryOptions: { retry: false } })
  const rows = services.result.data.filter(row => row.allowMembership)
  const serviceId = Form.useWatch('serviceId', form)
  const count = Form.useWatch('totalLessons', form) ?? 4
  const amount = Form.useWatch('totalPrice', form) ?? 0
  const selected = rows.find(row => row.id === serviceId)
  const recommended = Math.round(Number(selected?.price ?? 0) * 100) * count / 100
  const cashboxEnabled = access.isEnabled('CASHBOX')
  const allowed = canManage && !access.loading && !access.error && (!cashboxEnabled || access.canWrite('CASHBOX'))
  const close = () => {
    if (submitting.current) return
    if (!dirty && !uncertain) { navigate('/memberships'); return }
    modal.confirm({ title: uncertain ? 'Результат продажи пока неизвестен' : 'Закрыть продажу абонемента?',
      content: uncertain ? 'Перед новой продажей проверьте абонементы и кассу. Повтор в этой форме безопасен.' : 'Введённые данные будут потеряны.',
      okText: 'Закрыть', cancelText: 'Продолжить', onOk: () => navigate('/memberships') })
  }
  const recalculate = (changes: Partial<Values>, values: Values) => {
    setDirty(true)
    if ('pricingPlanId' in changes) {
      const plan = plans.result.data.find(row => row.id === changes.pricingPlanId)
      if (plan) { values = { ...values, totalLessons: plan.totalLessons }; form.setFieldsValue({ totalLessons: plan.totalLessons, validUntil: dayjs().add(plan.validDays, 'day') }) }
    }
    if ('serviceId' in changes || 'totalLessons' in changes || 'pricingPlanId' in changes) {
      const service = rows.find(row => row.id === values.serviceId)
      form.setFieldValue('totalPrice', Math.round(Number(service?.price ?? 0) * 100) * (values.totalLessons || 0) / 100)
    }
  }
  const submit = async (values: Values) => {
    if (submitting.current || !allowed) return
    if (!pending.current) pending.current = { ...values, validUntil: toInstant(`${values.validUntil.format('YYYY-MM-DD')}T23:59`), requestId: crypto.randomUUID() }
    submitting.current = true; setBusy(true); setError(undefined)
    try {
      const { data } = await httpClient.post<{ totalPrice: string; cashboxPosted: boolean }>(`${API_URL}/memberships`, pending.current)
      window.dispatchEvent(new Event('cash-desk-paid'))
      for (const resource of ['memberships', 'clients', 'payments']) void invalidate({ resource, invalidates: ['all'] }).catch(() => {})
      void message.success(data.cashboxPosted ? `Абонемент оформлен, оплата ${money(data.totalPrice)} проведена в кассу` : 'Абонемент оформлен. Касса клуба отключена, приход не создан.')
      navigate('/memberships')
    } catch (cause) {
      const failure = toHttpError(cause)
      const unknown = failure.details?.rollbackConfirmed !== true && (failure.statusCode === 0 || failure.statusCode >= 500)
      setUncertain(unknown)
      const detail = failure.message === 'Internal server error' ? 'Сервер не смог завершить оформление абонемента.' : failure.message
      setError(unknown ? `${detail} Результат операции пока неизвестен. Повторите продажу в этой форме с тем же ключом.` : detail)
      if (!unknown) pending.current = null
    } finally { submitting.current = false; setBusy(false) }
  }
  return <>
    <MembershipList />
    <EntryOverlay variant="drawer" open title="Продажа абонемента" width={620} onCancel={close}
      maskClosable={false} keyboard={!busy} closable={!busy} onOk={() => form.submit()}
      confirmLoading={busy} okText={uncertain ? 'Повторить продажу' : 'Создать абонемент'}
      okButtonProps={{ 'aria-label': uncertain ? 'Повторить продажу' : 'Создать абонемент', 'aria-busy': busy,
        disabled: busy || !allowed || services.query.isLoading || services.query.isError }} cancelButtonProps={{ disabled: busy }}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {access.error && <Alert type="error" message="Не удалось проверить доступ к кассе" action={<Button onClick={() => void access.refresh()}>Повторить</Button>} />}
      {!access.loading && !access.error && !allowed && <Alert type="warning" message="Для продажи требуется полный доступ к кассе" />}
      <Form<Values> form={form} noValidate layout="vertical" disabled={busy || uncertain || !allowed} onFinish={submit}
        scrollToFirstError initialValues={{ clientId: params.get('clientId') || undefined, totalLessons: 4, totalPrice: 0, paymentMethod: 'CASH', validUntil: dayjs().add(30, 'day') }} onValuesChange={recalculate}>
        <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }, { validator: (_, value) => !value || isUuid(value) ? Promise.resolve() : Promise.reject(new Error('Выберите клиента из списка')) }]}>
          <ClientSelectWithCreate placeholder="Выберите клиента" />
        </Form.Item>
        <Form.Item name="serviceId" label="Услуга" rules={[{ required: true, message: 'Выберите услугу' }, { validator: (_, value) => !value || isUuid(value) ? Promise.resolve() : Promise.reject(new Error('Выберите услугу из списка')) }]}>
          <Select aria-label="Услуга" showSearch allowClear optionFilterProp="label" loading={services.query.isLoading} placeholder="Выберите услугу"
            notFoundContent={services.query.isLoading ? 'Загрузка…' : 'Нет услуг для продажи абонемента'} options={rows.map(row => ({ value: row.id, label: `${row.title || row.name} · ${money(row.price)}` }))} />
        </Form.Item>
        {services.query.isError && <Alert type="error" showIcon message="Не удалось загрузить услуги" action={<Button onClick={() => void services.query.refetch()}>Повторить</Button>} />}
        <Form.Item name="pricingPlanId" label="Тариф" extra="Необязательно: заполняет количество занятий и срок действия. Цена рассчитывается по услуге."
          rules={[{ validator: (_, value) => !value || isUuid(value) ? Promise.resolve() : Promise.reject(new Error('Выберите тариф из списка')) }]}>
          <Select allowClear showSearch optionFilterProp="label" loading={plans.query.isLoading} options={plans.result.data.map(plan => ({ value: plan.id, label: plan.name }))} placeholder="Индивидуальный абонемент" />
        </Form.Item>
        {plans.query.isError && <Alert type="warning" message="Тарифы недоступны. Укажите количество и срок вручную." action={<Button onClick={() => void plans.query.refetch()}>Повторить</Button>} />}
        <Form.Item label="Количество занятий" required>
          <Space wrap style={{ marginBottom: 8 }}>{[4, 8, 10].map(value => <Button key={value} aria-pressed={count === value} onClick={() => { form.setFieldValue('totalLessons', value); recalculate({ totalLessons: value }, form.getFieldsValue()) }}>{value} занятий</Button>)}</Space>
          <Form.Item name="totalLessons" noStyle rules={[{ required: true, type: 'integer', min: 1, max: 10000, message: 'Укажите целое число от 1 до 10000' }]}>
            <InputNumber aria-label="Количество занятий" min={1} max={10000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form.Item>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={`Стоимость за занятие: ${money(selected?.price ?? 0)} × Количество: ${count} = Рекомендуемая цена: ${money(recommended)}`} />
        <Form.Item name="totalPrice" label="Итоговая стоимость к оплате (₽)" extra="Можно изменить для персональной скидки."
          rules={[{ required: true, type: 'number', min: 0, max: 9999999999.99, message: 'Укажите сумму от 0 до 9 999 999 999,99 ₽' }]}>
          <InputNumber aria-label="Итоговая стоимость к оплате (₽)" min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="paymentMethod" label="Способ оплаты" rules={[{ required: true }]}>
          <Segmented aria-label="Способ оплаты" block options={[{ label: 'Наличные', value: 'CASH' }, { label: 'Безналичные', value: 'CARD' }]} />
        </Form.Item>
        <Form.Item name="validUntil" label="Дата окончания" rules={[{ required: true, message: 'Укажите дату окончания' }]}>
          <DatePicker placeholder="Выберите дату" format="DD.MM.YYYY" disabledDate={date => date.endOf('day').isBefore(dayjs())} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="reason" label="Комментарий"><Input.TextArea rows={3} maxLength={500} /></Form.Item>
        {!access.loading && !access.error && <Alert showIcon type="info" message={cashboxEnabled ? `Сумма ${money(amount)} будет автоматически учтена в кассе клуба` : 'Касса клуба отключена. Абонемент будет оформлен без кассовой операции.'} />}
      </Form>
    </EntryOverlay>
  </>
}
