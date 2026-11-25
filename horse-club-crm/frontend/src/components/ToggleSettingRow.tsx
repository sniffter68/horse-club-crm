import { useId, type ReactNode } from 'react'
import { ConfigProvider, Switch } from 'antd'

export interface ToggleSettingRowProps {
  id?: string
  title: string
  description: string
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  children?: ReactNode
  'data-testid'?: string
}

export function ToggleSettingRow({ id, title, description, checked = false, onChange, disabled, children, 'data-testid': testId }: ToggleSettingRowProps) {
  const { componentDisabled } = ConfigProvider.useConfig()
  const isDisabled = disabled ?? componentDisabled
  const generatedId = useId()
  const switchId = id ?? `toggle-${generatedId}`
  const descriptionId = `${switchId}-description`
  const contentId = `${switchId}-content`
  return <div className="toggle-setting-row" data-checked={checked} data-disabled={isDisabled || undefined} data-testid={testId}>
    <label htmlFor={switchId} className="toggle-setting-row__control">
      <span className="toggle-setting-row__label">
        <span className="toggle-setting-row__title">{title}</span>
        <span id={descriptionId} className="toggle-setting-row__description">{description}</span>
      </span>
      <Switch id={switchId} checked={checked} onChange={onChange} disabled={isDisabled} aria-label={title}
        aria-describedby={descriptionId} aria-expanded={children ? checked : undefined} aria-controls={children && checked ? contentId : undefined} />
    </label>
    {checked && children && <div id={contentId} className="toggle-setting-row__children">{children}</div>}
  </div>
}
