import type { Dayjs } from 'dayjs'

export type BoardingContractStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'EXPIRED'

export interface BoardingContractValues {
  clientId: string
  horseId: string
  stallId?: string | null
  status: BoardingContractStatus
  startsAt: Dayjs | string
  endsAt?: Dayjs | string | null
  monthlyRate: number
  notes?: string | null
}

export interface BoardingContract extends Omit<BoardingContractValues, 'startsAt' | 'endsAt' | 'monthlyRate'> {
  id: string
  startsAt: string
  endsAt: string | null
  monthlyRate: string | number
  client: { id: string; name: string; firstName: string; lastName: string }
  horse: { id: string; name: string }
  stall: { id: string; name: string; isUnavailable: boolean } | null
  payments: Array<{
    id: string; amount: string | number; method: 'UNSPECIFIED' | 'CASH' | 'CARD' | 'TRANSFER';
    status: 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED'; paidAt: string | null; createdAt: string;
  }>
  createdAt: string
  updatedAt: string
}
