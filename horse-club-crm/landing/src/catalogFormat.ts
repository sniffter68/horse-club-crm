// Prisma stores these columns as free text. Preserve editorial text; translate known legacy codes.
const labels: Record<string, string> = {
  BEGINNER: 'Для начинающих', NOVICE: 'Для начинающих', INTERMEDIATE: 'Средний уровень',
  ADVANCED: 'Опытным всадникам', PROFESSIONAL: 'Профессионалам', ALL: 'Любой уровень', ALL_LEVELS: 'Любой уровень',
  DRESSAGE: 'Выездка', SHOW_JUMPING: 'Конкур', JUMPING: 'Конкур', EVENTING: 'Троеборье',
  TRAIL: 'Конные прогулки', TRAIL_RIDING: 'Конные прогулки', PONY: 'Пони-клуб', PONY_CLUB: 'Пони-клуб',
  INSTRUCTOR: 'Инструктор', TRAINER: 'Тренер', SENIOR_TRAINER: 'Старший тренер',
  COACH: 'Тренер', SPORT: 'Спорт', AMATEUR: 'Любительский уровень',
  CMS: 'КМС', KMS: 'КМС', MASTER_OF_SPORT: 'Мастер спорта', MS: 'Мастер спорта',
  CANDIDATE_MASTER: 'КМС', CANDIDATE_MASTER_OF_SPORT: 'КМС',
  FIRST_CATEGORY: 'Первый разряд', SECOND_CATEGORY: 'Второй разряд',
};
export function catalogLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return labels[text.replace(/[\s-]+/g, '_').toUpperCase()] ?? (/^[a-zA-Z][a-zA-Z_\d-]*$/.test(text) ? '' : text);
}
export function formatPrice(value: unknown): string {
  const amount = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0
    ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₽` : 'По запросу';
}
