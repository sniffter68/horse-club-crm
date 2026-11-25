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
    expect(render(false)).not.toContain('aria-label="Длительность"')
    expect(render(true, true)).toContain('disabled')
  })
})
