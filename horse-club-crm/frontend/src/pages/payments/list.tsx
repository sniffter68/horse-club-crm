import { Tag } from 'antd'
import dayjs from 'dayjs'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { Payment, PaymentMethod, PaymentStatus } from './types'

const methods: Record<PaymentMethod, string> = { CASH: 'Наличные', CARD: 'Карта', TRANSFER: 'Перевод' }
const statuses: Record<PaymentStatus, string> = { PENDING: 'Ожидается', PAID: 'Оплачен', REFUNDED: 'Возвращён', CANCELLED: 'Отменён' }
const colors: Record<PaymentStatus, string> = { PENDING: 'gold', PAID: 'green', REFUNDED: 'blue', CANCELLED: 'default' }
function personName(payment: Payment): string {
  return [payment.client.firstName, payment.client.lastName].filter(Boolean).join(' ') || payment.client.name || '—'
}

export function PaymentList() {
  return <CatalogList<Payment> resource="payments" title="Платежи · внутренний учёт" columns={[
    { key: 'client', title: 'Клиент', render: (_: unknown, record) => personName(record) },
    { key: 'amount', dataIndex: 'amount', title: 'Сумма', sorter: true, render: money },
    { key: 'method', dataIndex: 'method', title: 'Способ', sorter: true, render: (value: PaymentMethod) => methods[value] },
    { key: 'status', dataIndex: 'status', title: 'Статус', sorter: true,
      render: (value: PaymentStatus) => <Tag color={colors[value]}>{statuses[value]}</Tag> },
    { key: 'source', title: 'Основание', render: (_: unknown, record) => record.boardingContract
      ? `Постой: ${record.boardingContract.horse.name}`
      : record.booking ? `Занятие: ${record.booking.lesson.service.title || record.booking.lesson.service.name}` : 'Ручная запись' },
    { key: 'paidAt', dataIndex: 'paidAt', title: 'Дата оплаты', sorter: true,
      render: (value: string | null) => value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—' },
    { key: 'description', dataIndex: 'description', title: 'Комментарий', ellipsis: true },
  ]} />
}
