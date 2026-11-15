import { Select } from 'antd'
import { sexes } from '../stalls/mapTypes'

type Sex = keyof typeof sexes

export function HorseSexSelect({ value, onChange }: { value?: Sex | null; onChange?: (value: Sex | null) => void }) {
  return <Select<Sex | ''> value={value ?? ''} onChange={next => onChange?.(next || null)} allowClear
    aria-label="Пол" placeholder="Выберите пол" virtual={false}
    options={Object.entries(sexes).map(([value, label]) => ({ value, label }))} />
}
