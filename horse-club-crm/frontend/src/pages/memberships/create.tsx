import { Create, useForm, useSelect } from '@refinedev/antd'
import type { BaseRecord, HttpError } from '@refinedev/core'
import { Alert, DatePicker, Descriptions, Form, Input, InputNumber, Select } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { money } from '../catalogs/format'

type Values = {
  clientId: string
  pricingPlanId?: string
  totalLessons?: number
  validUntil?: Dayjs | string
  reason?: string
}

type Plan = BaseRecord & {
  id: string
  name: string
  totalLessons: number
  validDays: number
  price: string | number
}

export function MembershipCreate() {
  const { formProps, saveButtonProps } = useForm<BaseRecord, HttpError, Values>({
    resource: 'memberships',
    action: 'create',
    redirect: 'list',
  })
  const { selectProps: clientSelectProps } = useSelect({
    resource: 'clients',
    optionLabel: client => String(client.name ?? ''),
    optionValue: client => String(client.id ?? ''),
    pagination: { mode: 'server', pageSize: 100 },
  })
  const { query: plansQuery } = useSelect<Plan>({
    resource: 'pricing-plans',
    optionLabel: plan => plan.name,
    optionValue: plan => plan.id,
    pagination: { mode: 'off' },
  })
  const selectedPlanId = Form.useWatch('pricingPlanId', formProps.form)
  const selectedPlan = plansQuery.data?.data.find(plan => plan.id === selectedPlanId)
  const planOptions = plansQuery.data?.data.map(plan => ({
    value: plan.id,
    label: `${plan.name} · ${plan.totalLessons} занятий · ${plan.validDays} дней · ${money(plan.price)}`,
  })) ?? []

  return <Create title="Продажа абонемента" saveButtonProps={{ ...saveButtonProps, children: 'Создать абонемент' }}>
    <Form<Values>
      {...formProps}
      layout="vertical"
      style={{ maxWidth: 720 }}
      initialValues={{ validUntil: dayjs().add(30, 'day') }}
      onFinish={values => formProps.onFinish?.(values.pricingPlanId
        ? { clientId: values.clientId, pricingPlanId: values.pricingPlanId, reason: values.reason }
        : {
            ...values,
            validUntil: dayjs.isDayjs(values.validUntil)
              ? values.validUntil.toISOString()
              : values.validUntil,
          })}
    >
      <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
        <Select {...clientSelectProps} showSearch optionFilterProp="label" placeholder="Выберите клиента" />
      </Form.Item>

      <Form.Item name="pricingPlanId" label="Тариф" extra="Выберите готовый тариф или оставьте поле пустым для ручной выдачи.">
        <Select allowClear showSearch optionFilterProp="label" loading={plansQuery.isLoading}
          options={planOptions} placeholder="Выберите тариф" />
      </Form.Item>

      {plansQuery.error && <Alert type="error" showIcon message="Не удалось загрузить тарифы"
        description={plansQuery.error.message} style={{ marginBottom: 24 }} />}

      {selectedPlan && <Descriptions bordered size="small" column={1} style={{ marginBottom: 24 }} items={[
        { key: 'lessons', label: 'Количество занятий', children: selectedPlan.totalLessons },
        { key: 'validity', label: 'Срок действия', children: `${selectedPlan.validDays} дней с даты продажи` },
        { key: 'price', label: 'Стоимость', children: money(selectedPlan.price) },
      ]} />}

      <Form.Item name="totalLessons" label="Количество занятий"
        extra={selectedPlan ? 'Значение определяется выбранным тарифом.' : 'Обязательно при ручной выдаче.'}
        rules={[{ required: !selectedPlanId, message: 'Укажите количество занятий' }]}>
        <InputNumber min={1} max={10000} disabled={Boolean(selectedPlanId)} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item name="validUntil" label="Дата окончания"
        extra={selectedPlan ? 'Дата рассчитывается автоматически по сроку тарифа.' : 'Обязательно при ручной выдаче.'}
        rules={[{ required: !selectedPlanId, message: 'Укажите дату окончания' }]}>
        <DatePicker disabled={Boolean(selectedPlanId)} disabledDate={date => date.endOf('day').isBefore(dayjs())}
          style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item name="reason" label="Комментарий">
        <Input.TextArea rows={3} maxLength={500} />
      </Form.Item>
    </Form>
  </Create>
}
