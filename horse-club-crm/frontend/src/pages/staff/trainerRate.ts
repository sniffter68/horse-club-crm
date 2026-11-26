import { currency } from '../cash-desk/shared'
import type { Staff } from './types'

export function trainerRateLabel(staff: Staff): string {
  const trainer = staff.user?.trainer
  if (staff.user?.role !== 'TRAINER' || !trainer) return '—'
  if (trainer.payScheme === 'FIXED') return `${currency(trainer.fixedPay ?? 0)} / занятие`
  if (trainer.payScheme === 'CLUB') return 'Ставка клуба · 30%'
  const percent = `${Number(trainer.commissionPercent)}%`
  return !trainer.payScheme || trainer.payScheme === 'LEGACY' ? `${percent} · действующая схема` : percent
}
