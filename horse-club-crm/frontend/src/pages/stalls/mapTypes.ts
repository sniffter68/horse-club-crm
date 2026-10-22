export const zones = { MAIN: 'Основная конюшня', SUMMER: 'Летники', QUARANTINE: 'Карантин' }
export const sexes = { STALLION: 'Жеребец', MARE: 'Кобыла', GELDING: 'Мерин' }
export const statuses = { AVAILABLE: 'Свободен', OCCUPIED: 'Занят', MAINTENANCE: 'На ремонте', QUARANTINE: 'Карантин' }
export interface MapHorse {
  id: string; name: string; sex: keyof typeof sexes | null; birthYear: number | null;
  ownerType: 'club' | 'private'; status: string; feedingNotes: string | null;
  owner?: { name: string; firstName: string; lastName: string; phone: string | null } | null;
}
export interface MapStall {
  id: string; name: string; number: string | null; zone: keyof typeof zones; side: 'LEFT' | 'RIGHT';
  position: number | null; status: keyof typeof statuses; horseId: string | null; horse: MapHorse | null;
  notes: string | null; warnings: Array<{ neighborId: string; neighborNumber: string; message: string }>;
  isUnavailable?: boolean;
  rowPosition?: number | null;
}
export function feedingRows(notes: string | null) {
  const rows = ['Утро', 'День', 'Вечер', 'Сено, подкормки и особенности'].map(label => ({ label, value: '' }))
  let active = -1
  const rest: string[] = []
  for (const line of (notes ?? '').split('\n')) {
    const match = line.match(/^\s*(Утро|День|Вечер|Сено[^:]*|Подкормки[^:]*):\s*(.*)$/i)
    if (match) {
      active = rows.findIndex(row => row.label.toLowerCase() === match[1].toLowerCase())
      if (active < 0) active = 3
      rows[active].value += (rows[active].value ? '\n' : '') + (active === 3 ? `${match[1]}: ` : '') + match[2]
    } else if (active >= 0) rows[active].value += '\n' + line
    else if (line.trim()) rest.push(line)
  }
  return { rows, rest: rest.join('\n') }
}
