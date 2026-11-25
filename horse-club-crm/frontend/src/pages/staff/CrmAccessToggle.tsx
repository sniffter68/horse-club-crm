import { App, ConfigProvider, Switch } from 'antd'
import { ToggleSettingRow } from '../../components/ToggleSettingRow'

export const crmAccessDescription = 'При отключении сотрудник не сможет войти в систему. История занятий, смен и начислений сохранится.'

export function CrmAccessToggle({ checked = false, onChange, disabled, compact = false, name, self = false }: {
  checked?: boolean; onChange?: (checked: boolean) => void | Promise<void>; disabled?: boolean; compact?: boolean; name?: string; self?: boolean
}) {
  const { modal } = App.useApp()
  const { componentDisabled } = ConfigProvider.useConfig()
  const isDisabled = disabled || self || componentDisabled
  const change = (next: boolean) => {
    if (isDisabled) return
    if (next) { onChange?.(true); return }
    modal.confirm({ title: `Отключить доступ в CRM${name ? `: ${name}` : ''}?`, content: crmAccessDescription,
      okText: 'Отключить доступ', cancelText: 'Отмена', autoFocusButton: 'cancel', okButtonProps: { danger: true },
      onOk: () => onChange?.(false) })
  }
  return compact
    ? <Switch size="small" aria-label={`Доступ в CRM: ${name}`} title={self ? 'Нельзя отключить собственный доступ' : crmAccessDescription} checked={checked} disabled={isDisabled} onChange={change} />
    : <ToggleSettingRow title="Доступ в CRM" description={self ? 'Нельзя отключить собственный доступ. История занятий и начислений сохраняется.' : crmAccessDescription} checked={checked} disabled={isDisabled} onChange={change} />
}
