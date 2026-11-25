import { renderToStaticMarkup } from 'react-dom/server'
import { ConfigProvider, theme } from 'antd'
import { describe, expect, it } from 'vitest'
import { ToggleSettingRow } from './ToggleSettingRow'

describe('ToggleSettingRow', () => {
  for (const dark of [false, true]) it(`associates label, description and disclosure in ${dark ? 'dark' : 'light'} theme`, () => {
    const render = (checked: boolean, disabled = false) => renderToStaticMarkup(<ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <ToggleSettingRow id="walk" title="Прогулки" description="Допуск к прогулкам" checked={checked} disabled={disabled} data-testid="walk-row"><input aria-label="Длительность" /></ToggleSettingRow>
    </ConfigProvider>)
    expect(render(true)).toContain('for="walk"')
    expect(render(true)).toContain('aria-label="Прогулки"')
    expect(render(true)).toContain('aria-describedby="walk-description"')
    expect(render(true)).toContain('aria-controls="walk-content"')
    expect(render(true)).toContain('aria-expanded="true"')
    expect(render(false)).toContain('aria-expanded="false"')
    expect(render(false)).not.toContain('aria-controls=')
    expect(render(false)).not.toContain('aria-label="Длительность"')
    expect(render(true, true)).toContain('disabled')
  })

  it('inherits disabled state and allows an explicit override', () => {
    const render = (disabled?: boolean) => renderToStaticMarkup(<ConfigProvider componentDisabled>
      <ToggleSettingRow id="walk" title="Прогулки" description="Допуск к прогулкам" disabled={disabled} />
    </ConfigProvider>)
    expect(render()).toContain('data-disabled="true"')
    expect(render()).toContain('disabled=""')
    expect(render(false)).not.toContain('disabled=')
    expect(render()).not.toContain('aria-expanded=')
  })
})
