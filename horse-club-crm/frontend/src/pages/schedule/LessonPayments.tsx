import { isUuid } from '../../uuid'
import { useRef, useState } from 'react'
import { Alert, App, Button, Descriptions, Form, InputNumber, Modal, Radio, Space, Switch, Tag, Typography } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { usePermissions } from '../../modulePermissions'
import type { Lesson, LessonMoney } from './types'
import { lessonBalance, rubles } from './lessonPaymentSummary'

export function LessonGroupSummary({ lesson }: { lesson: LessonMoney }) {
  if (lesson.pricePerPerson == null) return null
  return <Typography.Paragraph>{lesson.service?.title || lesson.service?.name || 'Экскурсия'}: {lesson.participantsCount ?? 1} участников × {rubles(lesson.pricePerPerson)} = {rubles(Number(lesson.pricePerPerson) * (lesson.participantsCount ?? 1))}{Number(lesson.cost) !== Number(lesson.pricePerPerson) * (lesson.participantsCount ?? 1) ? ` · Итоговая стоимость: ${rubles(lesson.cost)}` : ''}</Typography.Paragraph>
}

export function LessonGroupBadge({ lesson }: { lesson: LessonMoney }) {
  return lesson.pricePerPerson != null || (lesson.participantsCount ?? 1) > 1 ? <Tag color="blue">👥 {lesson.participantsCount ?? 1} чел.</Tag> : null
}
export function LessonPaymentBadge({ lesson }: { lesson: LessonMoney }) {
  if (!lesson.bookings?.some(b => !b.membership && !b.membershipId)) return null
  const { cost, prepayment, remaining } = lessonBalance(lesson)
  if (!remaining && (cost > 0 || lesson.paymentStatus === 'PAID')) return <Tag color="success">Оплачено</Tag>
  return prepayment > 0 || remaining < cost
    ? <Tag color="warning">Предоплата: {rubles(prepayment)} / Остаток: {rubles(remaining)}</Tag>
    : <Tag>Не оплачено</Tag>
}

export function LessonPriceFields({ price, perPerson = false }: { price?: number | string; perPerson?: boolean }) {
  const form = Form.useFormInstance()
  const modules = usePermissions()
  const cost = Form.useWatch('cost', form) as number | undefined
  const prepayment = Form.useWatch('prepaymentAmount', form) as number | undefined
  const count = Form.useWatch('participantsCount', form) as number | undefined
  const rate = Form.useWatch('pricePerPerson', form) as number | undefined
  const recalculate = (value: number | null) => form.setFieldsValue({ participantsCount: value, cost: value == null ? undefined : Math.round(Number(rate ?? price ?? 0) * value * 100) / 100 })
  const [enabled, setEnabled] = useState(false)
  const canPay = !modules.isEnabled('CASHBOX') || modules.canWrite('CASHBOX')
  return <>
    {perPerson && <>
      <Form.Item name="participantsCount" initialValue={1} label="Количество участников" rules={[{ required: true, message: 'Укажите количество участников' }, { type: 'integer', min: 1, max: 100, message: 'Введите целое число от 1 до 100' }]}>
        <InputNumber min={1} max={100} precision={0} onChange={recalculate} />
      </Form.Item>
      <Space wrap>{[10, 20, 25, 30].map(value => <Button key={value} onClick={() => recalculate(value)}>{value}</Button>)}</Space>
      <Form.Item name="pricePerPerson" initialValue={Number(price ?? 0)} hidden><InputNumber /></Form.Item>
      <Typography.Paragraph aria-live="polite">Цена за 1 участника: {rubles(rate ?? price)} · {rubles(rate ?? price)} × {count ?? 1} участников = {rubles(Number(rate ?? price ?? 0) * (count ?? 1))}</Typography.Paragraph>
    </>}
    <Form.Item name="cost" initialValue={Number(price ?? 0)} label={perPerson ? 'Итоговая стоимость (₽)' : 'Стоимость услуги (₽)'} rules={[{ required: true, message: 'Укажите стоимость' }, { type: 'number', min: 0, max: 9999999999.99, message: 'Укажите неотрицательную стоимость' }]}>
      <InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} />
    </Form.Item>
    <Space><Switch aria-label="Внесена предоплата" checked={enabled} disabled={!canPay} onChange={value => {
      setEnabled(value); form.setFieldsValue({ prepaymentAmount: 0, prepaymentMethod: value ? 'CASH' : undefined })
    }} /><Typography.Text>Внесена предоплата</Typography.Text></Space>
    {!canPay && <Typography.Paragraph type="secondary">Для приёма предоплаты нужен полный доступ к кассе.</Typography.Paragraph>}
    {enabled && <>
      <Form.Item name="prepaymentAmount" label="Сумма предоплаты (₽)" rules={[{ required: true, message: 'Укажите сумму' }, { validator: async (_, value) => {
        if (!Number.isFinite(value) || value <= 0 || value > Number(cost ?? price ?? 0)) throw new Error('Предоплата должна быть больше нуля и не превышать стоимость')
      } }]} dependencies={['cost']}>
        <InputNumber min={0.01} max={Number(cost ?? price ?? 0)} precision={2} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="prepaymentMethod" label="Способ предоплаты" rules={[{ required: true, message: 'Выберите способ оплаты' }]}>
        <Radio.Group options={[{ value: 'CASH', label: 'Наличные' }, { value: 'CARD', label: 'Безналичные' }]} />
      </Form.Item>
      <Typography.Paragraph type="secondary" aria-live="polite">{modules.isEnabled('CASHBOX') ? `Сумма ${rubles(prepayment)} будет сразу внесена в кассу` : 'Предоплата будет сохранена в занятии. Модуль кассы выключен.'}</Typography.Paragraph>
    </>}
  </>
}

export function CompleteLessonModal({ lesson, onClose, onSaved }: { lesson: Lesson; onClose: () => void; onSaved: (lesson: Lesson) => void }) {
  const modules = usePermissions()
  const { message } = App.useApp()
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'DEBT'>('DEBT')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const busyRef = useRef(false)
  const { cost, prepayment, remaining } = lessonBalance(lesson)
  const oneOff = lesson.bookings.some(b => !b.membership)
  const canPay = !modules.isEnabled('CASHBOX') || modules.canWrite('CASHBOX')
  async function save() {
    if (busyRef.current || !modules.canWrite('SCHEDULE')) return
    if (!isUuid(lesson.id)) { setError('Некорректный идентификатор занятия'); return }
    busyRef.current = true; setBusy(true); setError(undefined)
    try {
      const { data } = await httpClient.post<Lesson>(`${API_URL}/lessons/${lesson.id}/complete`, {
        payRemaining: oneOff && remaining > 0 && method !== 'DEBT',
        ...(oneOff && remaining > 0 && method !== 'DEBT' ? { paymentMethod: method } : {}),
      })
      window.dispatchEvent(new Event('cash-desk-paid'))
      void message.success('Занятие завершено')
      onSaved(data)
    } catch (cause) { setError(toHttpError(cause).message) }
    finally { busyRef.current = false; setBusy(false) }
  }
  return <Modal open title="Занятие состоялось" okText="Завершить занятие" cancelText="Отмена" confirmLoading={busy}
    okButtonProps={{ disabled: !modules.canWrite('SCHEDULE') }} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} keyboard={!busy}
    onCancel={() => { if (!busy) onClose() }} onOk={() => void save()}>
    {error && <Alert type="error" showIcon message={error} />}
    {oneOff ? <>
      <LessonGroupSummary lesson={lesson} />
      <Descriptions column={1} items={[
        { key: 'cost', label: 'Стоимость', children: rubles(cost) },
        { key: 'prepayment', label: 'Предоплата', children: `${rubles(prepayment)}${prepayment > 0 ? lesson.prepaymentMethod === 'CASH' ? ' · Наличные' : ' · Безналичные' : ''}` },
        { key: 'remaining', label: 'Остаток к доплате', children: <strong>{rubles(remaining)}</strong> },
      ]} />
      {remaining > 0 ? <>
        <Radio.Group aria-label="Доплата за занятие" value={method} disabled={busy} onChange={event => setMethod(event.target.value)}>
          <Space direction="vertical"><Radio value="CASH" disabled={!canPay}>Оплачено наличными</Radio><Radio value="CARD" disabled={!canPay}>Оплачено картой</Radio><Radio value="DEBT">Оставить неоплаченным (долг)</Radio></Space>
        </Radio.Group>
        <Typography.Paragraph type="secondary">{!canPay ? 'Для приёма доплаты нужен полный доступ к кассе.' : modules.isEnabled('CASHBOX') ? 'Сумма доплаты будет проведена в кассу клуба' : 'Доплата будет сохранена в занятии. Модуль кассы выключен.'}</Typography.Paragraph>
      </> : <Tag color="success">Занятие полностью предоплачено</Tag>}
    </> : <Typography.Paragraph>Занятие будет списано с абонемента.</Typography.Paragraph>}
  </Modal>
}
