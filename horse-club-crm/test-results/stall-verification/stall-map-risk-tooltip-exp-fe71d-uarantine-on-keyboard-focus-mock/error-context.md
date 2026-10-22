# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stall-map.spec.ts >> risk tooltip explains opposite stallions and quarantine on keyboard focus
- Location: e2e\stall-map.spec.ts:58:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('tooltip')
Expected: "Карантинная зона"
Error: strict mode violation: getByRole('tooltip') resolved to 2 elements:
    1) <div id="_r_v_" role="tooltip" class="ant-tooltip-inner">…</div> aka getByRole('tooltip', { name: 'Нежелательное соседство: жеребец напротив жеребца (Буран и Гром)' })
    2) <div id="_r_13_" role="tooltip" class="ant-tooltip-inner">…</div> aka getByRole('tooltip', { name: 'Карантинная зона' })

Call log:
  - Expect "toHaveText" getByRole('tooltip') with timeout 5000ms
  - waiting for getByRole('tooltip')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - link "Horse Club OS — главная" [ref=e8] [cursor=pointer]:
            - /url: /
            - generic [aria-hidden] [ref=e9]: 🐎
            - generic [ref=e10]: Horse Club OS
          - button "Включить тёмную тему" [ref=e11] [cursor=pointer]:
            - img "moon" [ref=e13]
        - menu [ref=e16]:
          - menuitem [ref=e17] [cursor=pointer]:
            - img "unordered-list" [ref=e18]
            - link "Дашборд" [ref=e22]:
              - /url: /
          - menuitem "calendar Занятия" [ref=e23] [cursor=pointer]:
            - img "calendar" [ref=e24]
            - generic [ref=e27]: Занятия
          - menuitem "credit-card Клиенты и финансы" [ref=e28] [cursor=pointer]:
            - img "credit-card" [ref=e29]
            - generic [ref=e32]: Клиенты и финансы
          - menuitem "home Лошади и постой" [ref=e33] [cursor=pointer]:
            - img "home" [ref=e34]
            - generic [ref=e37]: Лошади и постой
          - menuitem "team Клуб и команда" [ref=e38] [cursor=pointer]:
            - img "team" [ref=e39]
            - generic [ref=e42]: Клуб и команда
          - menuitem "setting Администрирование" [ref=e43] [cursor=pointer]:
            - img "setting" [ref=e44]
            - generic [ref=e47]: Администрирование
          - menuitem "logout Выход" [ref=e48] [cursor=pointer]:
            - img "logout" [ref=e49]
            - generic [ref=e52]: Выход
      - img "left" [ref=e54] [cursor=pointer]
    - generic [ref=e57]:
      - generic [ref=e58]:
        - generic [ref=e59]:
          - button "Включить звуковые пуши о заявках" [ref=e61] [cursor=pointer]
          - button "Уведомления о заявках" [ref=e64] [cursor=pointer]:
            - img "bell" [ref=e66]
        - button "Принять платёж" [ref=e69] [cursor=pointer]:
          - img "plus" [ref=e71]
      - main [ref=e76]:
        - generic [ref=e77]:
          - generic [ref=e78]:
            - heading "Карта денников" [level=2] [ref=e80]
            - link "Список денников" [ref=e82] [cursor=pointer]:
              - /url: /stalls
            - button "Обновить" [ref=e84] [cursor=pointer]
            - generic "Корпус" [ref=e87] [cursor=pointer]:
              - generic [ref=e89]:
                - combobox "Корпус" [ref=e91]
                - generic "Все корпуса" [ref=e92]
          - generic [ref=e93]:
            - generic [ref=e96]:
              - generic [ref=e97]: Всего денников
              - generic [ref=e98]: "3"
            - generic [ref=e101]:
              - generic [ref=e102]:
                - generic [ref=e103]: Занято
                - generic [ref=e104]: "2"
              - generic [ref=e106]: "Клубные: 1 · Частные: 1"
            - generic [ref=e109]:
              - generic [ref=e110]: Свободно
              - generic [ref=e111]: "0"
            - generic [ref=e115]:
              - generic [ref=e116]: Ремонт / карантин
              - generic [ref=e117]: "1"
          - region "Основная конюшня" [ref=e119]:
            - heading "Основная конюшня" [level=3] [ref=e120]
            - generic [ref=e121]:
              - generic [ref=e122]: Левый ряд
              - generic [ref=e123]: Проход
              - generic [ref=e124]: Правый ряд
            - generic [ref=e126]:
              - button "Денник 1, Буран" [ref=e127] [cursor=pointer]:
                - generic [ref=e128]:
                  - strong [ref=e129]: № 1
                  - generic [ref=e130]: Занят
                - generic [ref=e131]: Буран
                - generic [ref=e132]: Жеребец · Частный постой
                - generic [ref=e133]: Доступна
                - generic [ref=e134]:
                  - img "warning" [ref=e135]
                  - text: Риск соседства
              - generic [aria-hidden] [ref=e138]: "1"
              - button "Денник 2, Искра" [ref=e139] [cursor=pointer]:
                - generic [ref=e140]:
                  - strong [ref=e141]: № 2
                  - generic [ref=e142]: Занят
                - generic [ref=e143]: Искра
                - generic [ref=e144]: Кобыла · Клубная
                - generic [ref=e145]: Доступна
          - region "Летники" [ref=e146]:
            - heading "Летники" [level=3] [ref=e147]
            - generic [ref=e148]:
              - generic [ref=e149]: Левый ряд
              - generic [ref=e150]: Проход
              - generic [ref=e151]: Правый ряд
            - generic [ref=e153]:
              - button "Денник Л-1, Карантин" [active] [ref=e154] [cursor=pointer]:
                - generic [ref=e155]:
                  - strong [ref=e156]: № Л-1
                  - generic [ref=e157]: Карантин
                - generic [ref=e158]: —
                - generic [ref=e159]:
                  - img "warning" [ref=e160]
                  - text: Риск соседства
              - generic [aria-hidden] [ref=e163]: "1"
  - generic:
    - generic:
      - generic:
        - 'tooltip "Нежелательное соседство: жеребец напротив жеребца (Буран и Гром)"'
  - tooltip "Карантинная зона" [ref=e167]
```

# Test source

```ts
  1   | import { test, expect, type Page } from './fixtures'
  2   | const horse = { id: 'h1', name: 'Буран', sex: 'STALLION', birthYear: 2016, status: 'active', ownerType: 'private',
  3   |   feedingNotes: 'Утро: овёс 1 кг\nДень: морковь\nВечер: овёс 1 кг\nСено: 8 кг\nПодкормки: соль',
  4   |   owner: { name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567' } }
  5   | const mare = { ...horse, id: 'h2', name: 'Искра', sex: 'MARE', ownerType: 'club' }
  6   | const initial = [
  7   |   { id: 's1', name: 'Денник 1', number: '1', zone: 'MAIN', side: 'LEFT', position: 1, status: 'OCCUPIED', horseId: 'h1', horse, notes: 'Двойной слой опилок', warnings: [{ neighborId: 's2', neighborNumber: '2', message: 'Жеребец рядом с кобылой (Буран и Искра)' }] },
  8   |   { id: 's2', name: 'Денник 2', number: '2', zone: 'MAIN', side: 'RIGHT', position: 1, status: 'OCCUPIED', horseId: 'h2', horse: mare, notes: null, warnings: [] },
  9   |   { id: 's3', name: 'Летник 1', number: 'Л-1', zone: 'SUMMER', side: 'LEFT', position: 1, status: 'AVAILABLE', horseId: null, horse: null, notes: null, warnings: [] },
  10  | ]
  11  | async function setup(page: Page, role = 'ADMIN', empty = false) {
  12  |   await page.addInitScript(role => {
  13  |     localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', role); localStorage.setItem('horsecrm.email', 'qa@example.com')
  14  |     Object.defineProperty(window, 'print', { value: () => { document.body.dataset.printed = 'true' } })
  15  |   }, role)
  16  |   await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role, userId: 'u1', permissions: {
  17  |     horseReplaceOwn: true, horseReplaceAny: true, healthRead: true, healthWrite: true, financeRead: true, boardingAccess: true,
  18  |   } } }))
  19  |   const state = { stalls: empty ? [] : structuredClone(initial), fail: false, assignments: 0 }
  20  |   await page.route('**/api/stalls/assignment-horses', route => route.fulfill({ json: [horse, mare] }))
  21  |   await page.route('**/api/stalls/map', route => state.fail ? route.fulfill({ status: 503, json: { message: 'Сервер временно недоступен' } }) : route.fulfill({ json: state.stalls }))
  22  |   await page.route('**/api/stalls/*/assign', route => {
  23  |     state.assignments++
  24  |     if (state.fail) return route.fulfill({ status: 409, json: { message: 'Денник уже занят. Обновите карту.' } })
  25  |     const id = route.request().url().split('/').at(-2), { horseId } = route.request().postDataJSON()
  26  |     state.stalls = state.stalls.map(s => s.id === id ? { ...s, horseId, horse: horseId === 'h1' ? horse : horseId === 'h2' ? mare : null, status: horseId ? 'OCCUPIED' : 'AVAILABLE' }
  27  |       : s.horseId === horseId && horseId ? { ...s, horseId: null, horse: null, status: 'AVAILABLE' } : s)
  28  |     return route.fulfill({ json: state.stalls.find(s => s.id === id) })
  29  |   })
  30  |   await page.route('**/api/stalls/s3', route => {
  31  |     if (state.fail) return route.fulfill({ status: 409, json: { message: 'Изменения не сохранены' } })
  32  |     state.stalls[2] = { ...state.stalls[2], ...route.request().postDataJSON() }
  33  |     return route.fulfill({ json: state.stalls[2] })
  34  |   })
  35  |   await page.goto('/stable')
  36  |   return state
  37  | }
  38  | test('map shows both rows, warnings, sign and isolated print layout', async ({ page }) => {
  39  |   await setup(page)
  40  |   await expect(page.getByRole('heading', { name: 'Карта денников' })).toBeVisible()
  41  |   await expect(page.getByText('Риск соседства', { exact: true })).toBeVisible()
  42  |   await page.getByText('Риск соседства', { exact: true }).hover()
  43  |   await expect(page.getByRole('tooltip')).toHaveText('Жеребец рядом с кобылой (Буран и Искра)')
  44  |   await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  45  |   await expect(page.getByRole('alert')).toContainText('Жеребец рядом с кобылой (Буран и Искра)')
  46  |   await page.getByRole('button', { name: 'Печать таблички на денник' }).click()
  47  |   const sign = page.getByRole('article', { name: 'Табличка на денник' })
  48  |   await expect(sign.getByRole('heading', { name: 'Буран' })).toBeVisible()
  49  |   for (const text of ['2016 г. р.', 'Анна Орлова', '+79991234567', 'овёс 1 кг', 'Сено: 8 кг', 'Двойной слой опилок'])
  50  |     await expect(sign.getByText(text, { exact: false }).first()).toBeVisible()
  51  |   await page.getByRole('button', { name: 'Печать', exact: true }).click()
  52  |   await expect(page.locator('body')).toHaveAttribute('data-printed', 'true')
  53  |   await page.emulateMedia({ media: 'print' })
  54  |   await expect(page.locator('#root')).toBeHidden()
  55  |   await expect(sign).toBeVisible()
  56  |   await page.screenshot({ path: 'test-results/stall-sign.png', fullPage: true })
  57  | })
  58  | test('risk tooltip explains opposite stallions and quarantine on keyboard focus', async ({ page }) => {
  59  |   const state = await setup(page)
  60  |   const reason = 'Нежелательное соседство: жеребец напротив жеребца (Буран и Гром)'
  61  |   state.stalls[0].warnings[0].message = reason
  62  |   state.stalls[2].status = 'QUARANTINE'
  63  |   await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  64  |   await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).focus()
  65  |   await expect(page.getByRole('tooltip')).toHaveText(reason)
  66  |   await page.getByRole('button', { name: 'Денник Л-1, Карантин', exact: true }).focus()
> 67  |   await expect(page.getByRole('tooltip')).toHaveText('Карантинная зона')
      |                                           ^ Error: expect(locator).toHaveText(expected) failed
  68  | })
  69  | 
  70  | test('manager relocates a horse and the previous stall becomes free', async ({ page }) => {
  71  |   const state = await setup(page, 'MANAGER')
  72  |   await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  73  |   await page.getByRole('combobox', { name: 'Лошадь для заселения' }).click()
  74  |   await page.getByText('Буран · переселить из 1', { exact: true }).click()
  75  |   await page.getByRole('button', { name: 'Заселить лошадь' }).click()
  76  |   await expect(page.getByRole('button', { name: 'Денник Л-1, Буран' })).toBeVisible()
  77  |   await expect(page.getByRole('button', { name: 'Денник 1, Свободен', exact: true })).toBeVisible()
  78  |   expect(state.assignments).toBe(1)
  79  | })
  80  | test('trainer can read rations and print but cannot mutate', async ({ page }) => {
  81  |   await setup(page, 'TRAINER')
  82  |   await page.getByRole('button', { name: 'Денник 1, Буран', exact: true }).click()
  83  |   await expect(page.getByRole('heading', { name: 'Рацион кормления' })).toBeVisible()
  84  |   await expect(page.getByRole('button', { name: 'Сохранить денник' })).toHaveCount(0)
  85  |   await expect(page.getByRole('button', { name: 'Убрать лошадь из денника' })).toHaveCount(0)
  86  |   await page.getByRole('button', { name: 'Печать таблички на денник' }).click()
  87  |   await expect(page.getByRole('article')).toBeVisible()
  88  | })
  89  | test('failed assignment retains selection and shows a recoverable error', async ({ page }) => {
  90  |   const state = await setup(page)
  91  |   await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  92  |   await page.getByRole('combobox', { name: 'Лошадь для заселения' }).click()
  93  |   await page.getByText('Буран · переселить из 1', { exact: true }).click()
  94  |   state.fail = true
  95  |   await page.getByRole('button', { name: 'Заселить лошадь' }).click()
  96  |   await expect(page.getByText('Денник уже занят. Обновите карту.')).toBeVisible()
  97  |   state.fail = false
  98  |   await page.getByRole('button', { name: 'Заселить лошадь' }).click()
  99  |   await expect(page.getByRole('button', { name: 'Денник Л-1, Буран' })).toBeVisible()
  100 | })
  101 | test('narrow layout, building filter, keyboard selection and focus restoration', async ({ page }) => {
  102 |   await page.setViewportSize({ width: 390, height: 844 })
  103 |   await setup(page, 'TRAINER')
  104 |   const tile = page.getByRole('button', { name: 'Денник 1, Буран', exact: true })
  105 |   await tile.focus(); await page.keyboard.press('Enter')
  106 |   await expect(page.getByRole('dialog')).toBeVisible()
  107 |   await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).focus()
  108 |   await page.keyboard.press('Escape')
  109 |   await expect(page.getByRole('dialog')).toHaveCount(0)
  110 |   await expect(tile).toBeFocused()
  111 |   await page.getByRole('combobox', { name: 'Корпус' }).focus()
  112 |   await page.keyboard.press('ArrowDown')
  113 |   await page.locator('.ant-select-dropdown').getByText('Летники', { exact: true }).click()
  114 |   await expect(tile).toHaveCount(0)
  115 |   await expect(page).toHaveURL(/zone=SUMMER/)
  116 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  117 |   await page.keyboard.press('Escape')
  118 |   await page.screenshot({ path: 'test-results/stall-map-mobile.png', fullPage: true })
  119 | })
  120 | test('status and notes save, and unavailable stalls cannot be populated', async ({ page }) => {
  121 |   await setup(page)
  122 |   await page.getByRole('button', { name: 'Денник Л-1, Свободен' }).click()
  123 |   await page.getByRole('combobox', { name: 'Статус денника' }).focus()
  124 |   await page.keyboard.press('ArrowDown')
  125 |   await page.locator('.ant-select-dropdown').getByText('На ремонте', { exact: true }).click()
  126 |   await page.getByRole('textbox', { name: 'Заметки для конюха' }).fill('Починить поилку')
  127 |   await page.getByRole('button', { name: 'Сохранить денник' }).click()
  128 |   await page.getByRole('button', { name: 'Денник Л-1, На ремонте' }).click()
  129 |   await expect(page.getByRole('combobox', { name: 'Лошадь для заселения' })).toBeDisabled()
  130 |   await expect(page.getByRole('textbox', { name: 'Заметки для конюха' })).toHaveValue('Починить поилку')
  131 | })
  132 | test('empty map and fetch error offer clear feedback and retry', async ({ page }) => {
  133 |   const state = await setup(page, 'ADMIN', true)
  134 |   await expect(page.getByText('Денников в этом корпусе пока нет')).toBeVisible()
  135 |   state.fail = true
  136 |   await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  137 |   await expect(page.getByText('Не удалось загрузить карту')).toBeVisible()
  138 |   state.fail = false
  139 |   await page.getByRole('button', { name: 'Повторить' }).click()
  140 |   await expect(page.getByText('Денников в этом корпусе пока нет')).toBeVisible()
  141 | })
  142 | 
```