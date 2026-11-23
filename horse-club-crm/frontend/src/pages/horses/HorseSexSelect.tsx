import { Select, type SelectProps } from 'antd'
import { sexes } from '../stalls/mapTypes'

type Sex = keyof typeof sexes

type Props = Omit<SelectProps<Sex | ''>, 'value' | 'onChange' | 'options'> & {
  value?: Sex | null; onChange?: (value: Sex | null) => void
}

export function HorseSexSelect({ value, onChange, ...props }: Props) {
  return <Select<Sex | ''> {...props} value={value ?? ''} onChange={next => onChange?.(next || null)} allowClear
    aria-label="Пол" placeholder="Выберите пол" virtual={false}
    options={Object.entries(sexes).map(([value, label]) => ({ value, label }))} />
}
