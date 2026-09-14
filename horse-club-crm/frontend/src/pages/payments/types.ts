import type { Dayjs } from 'dayjs'

export type PaymentMethod = 'UNSPECIFIED' | 'CASH' | 'CARD' | 'TRANSFER'
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED'

export interface PaymentValues {
  clientId?: string
  bookingId?: string | null
  boardingContractId?: string | null
  membershipId?: string | null
  amount?: number
  method: PaymentMethod
  status: PaymentStatus
  paidAt?: Dayjs | string | null
  description?: string | null
}

export interface Payment extends Omit<PaymentValues, 'amount' | 'paidAt'> {
  id: string
  amount: string | number
  paidAt: string | null
  client: { id: string; name: string; firstName: string; lastName: string }
  boardingContract: { id: string; horse: { id: string; name: string }; stall: { id: string; name: string } | null } | null
  membership: { id: string; pricingPlan: { id: string; name: string; price: string | number } | null } | null
  booking: { id: string; lesson: { id: string; startTime: string; service: { id: string; title: string; name: string; price: string | number } } } | null
  createdAt: string
  updatedAt: string
}

export interface BookingPaymentOption {
  id: string
  clientId: string
  client: { id: string; name: string; firstName: string; lastName: string }
  lesson: { id: string; startTime: string; service: { id: string; title: string; name: string; price: string | number } }
}
