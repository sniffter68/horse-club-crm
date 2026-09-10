import { Create, useForm, useSelect } from '@refinedev/antd'
import type { BaseRecord, HttpError } from '@refinedev/core'
import { DatePicker, Form, Input, InputNumber, Select } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

type Values = { clientId: string; pricingPlanId?: string; totalLessons?: number; validUntil?: Dayjs; reason?: string }
type Plan = { id: string; name: string; totalLessons: number; validDays: number }
export function MembershipCreate() {
  const { formProps, saveButtonProps } = useForm<BaseRecord, HttpError, Values>({ resource: 'memberships', action: 'create', redirect: 'list' })
  const { selectProps: clientSelectProps } = useSelect({ resource: 'clients', optionLabel: 'name', optionValue: 'id', pagination: { mode: 'server', pageSize: 100 } })
  const { selectProps: planSelectProps } = useSelect<Plan>({ resource: 'memberships/pricing-plans', optionLabel: 'name', optionValue: 'id', pagination: { mode: 'off' } })
  return <Create title="Продажа абонемента" saveButtonProps={saveButtonProps}>
    <Form<Values> {...formProps} layout="vertical" initialValues={{ validUntil: dayjs().add(30, 'day') }} onFinish={values => formProps.onFinish?.({ ...values, validUntil: values.validUntil?.toISOString() } as Values)}>
      <Form.Item name="clientId" label="Клиент" rules={[{ required: true }]}><Select {...clientSelectProps} showSearch optionFilterProp="label" /></Form.Item>
      <Form.Item name="pricingPlanId" label="Тариф"><Select {...planSelectProps} allowClear placeholder="Выберите тариф или заполните поля ниже" /></Form.Item>
      <Form.Item name="totalLessons" label="Количество занятий" extra="Обязательно при ручной выдаче без выбранного тарифа."><InputNumber min={1} max={10000} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="validUntil" label="Дата окончания" extra="Обязательно при ручной выдаче без выбранного тарифа."><DatePicker style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="reason" label="Комментарий"><Input.TextArea rows={3} /></Form.Item>
    </Form>
  </Create>
}
