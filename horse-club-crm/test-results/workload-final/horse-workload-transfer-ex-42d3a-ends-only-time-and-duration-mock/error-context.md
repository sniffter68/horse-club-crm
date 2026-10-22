# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: horse-workload.spec.ts >> transfer excludes the original lesson, preserves participants and sends only time and duration
- Location: e2e\horse-workload.spec.ts:92:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Object {
    "durationMinutes": 120,
-   "startTime": "2026-10-08T09:00:00.000Z",
+   "startTime": "2026-10-08T07:00:00.000Z",
  }
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
          - heading "Расписание занятий" [level=2] [ref=e79]
          - generic [ref=e80]: "Часовой пояс клуба: Europe/Moscow"
          - generic [ref=e83]:
            - generic "Фильтр по тренеру" [ref=e85] [cursor=pointer]:
              - generic [ref=e87]:
                - combobox "Фильтр по тренеру" [ref=e89]
                - generic: Все тренеры
            - generic "Фильтр по лошади" [ref=e91] [cursor=pointer]:
              - generic [ref=e93]:
                - combobox "Фильтр по лошади" [ref=e95]
                - generic: Все лошади
            - generic "Фильтр по манежу" [ref=e97] [cursor=pointer]:
              - generic [ref=e99]:
                - combobox "Фильтр по манежу" [ref=e101]
                - generic: Все манежи
            - button "Обновить" [ref=e103] [cursor=pointer]
            - generic [ref=e106]:
              - text: Дата нагрузки
              - textbox "Дата нагрузки" [ref=e107]: 2026-10-08
            - button "Нагрузка лошадей" [ref=e109] [cursor=pointer]
            - generic "Группировка расписания" [ref=e112] [cursor=pointer]:
              - generic [ref=e114]:
                - combobox "Группировка расписания" [ref=e116]
                - generic "Календарь" [ref=e117]
            - button "Записать на тренировку" [ref=e119] [cursor=pointer]
          - generic [ref=e122]:
            - generic [ref=e123]: Запланировано
            - generic [ref=e125]: Проведено
            - generic [ref=e127]: Неявка
            - generic [ref=e129]: Отменено
          - generic [ref=e137]:
            - generic [ref=e138]:
              - generic [ref=e139]:
                - generic [ref=e140]:
                  - button "Пред" [ref=e141] [cursor=pointer]:
                    - img [ref=e142]: 
                  - button "След" [ref=e143] [cursor=pointer]:
                    - img [ref=e144]: 
                - button "Сегодня" [disabled] [ref=e145]
              - heading "5 – 11 окт. 2026 г." [level=2] [ref=e147]
              - generic [ref=e149]:
                - button "Неделя" [pressed] [ref=e150] [cursor=pointer]
                - button "День" [ref=e151] [cursor=pointer]
            - generic "5 – 11 окт. 2026 г." [ref=e152]:
              - grid [ref=e154]:
                - rowgroup [ref=e155]:
                  - row [ref=e160]:
                    - columnheader "5 октября 2026 г." [ref=e161]:
                      - generic "5 октября 2026 г." [ref=e163] [cursor=pointer]: пн 05.10
                    - columnheader "6 октября 2026 г." [ref=e164]:
                      - generic "6 октября 2026 г." [ref=e166] [cursor=pointer]: вт 06.10
                    - columnheader "7 октября 2026 г." [ref=e167]:
                      - generic "7 октября 2026 г." [ref=e169] [cursor=pointer]: ср 07.10
                    - columnheader "8 октября 2026 г." [ref=e170]:
                      - generic "8 октября 2026 г." [ref=e172] [cursor=pointer]: чт 08.10
                    - columnheader "9 октября 2026 г." [ref=e173]:
                      - generic "9 октября 2026 г." [ref=e175] [cursor=pointer]: пт 09.10
                    - columnheader "10 октября 2026 г." [ref=e176]:
                      - generic "10 октября 2026 г." [ref=e178] [cursor=pointer]: сб 10.10
                    - columnheader "11 октября 2026 г." [ref=e179]:
                      - generic "11 октября 2026 г." [ref=e181] [cursor=pointer]: вс 11.10
                - rowgroup [ref=e182]:
                  - generic [ref=e185]:
                    - table [aria-hidden] [ref=e187]:
                      - rowgroup [ref=e190]:
                        - row [ref=e191]:
                          - cell [ref=e192]:
                            - generic [ref=e193]: "9"
                          - cell [ref=e195]
                        - row [ref=e196]:
                          - cell [ref=e197]
                          - cell [ref=e198]
                        - row [ref=e199]:
                          - cell [ref=e200]:
                            - generic [ref=e201]: "10"
                          - cell [ref=e203]
                        - row [ref=e204]:
                          - cell [ref=e205]
                          - cell [ref=e206]
                        - row [ref=e207]:
                          - cell [ref=e208]:
                            - generic [ref=e209]: "11"
                          - cell [ref=e211]
                        - row [ref=e212]:
                          - cell [ref=e213]
                          - cell [ref=e214]
                        - row [ref=e215]:
                          - cell [ref=e216]:
                            - generic [ref=e217]: "12"
                          - cell [ref=e219]
                        - row [ref=e220]:
                          - cell [ref=e221]
                          - cell [ref=e222]
                        - row [ref=e223]:
                          - cell [ref=e224]:
                            - generic [ref=e225]: "13"
                          - cell [ref=e227]
                        - row [ref=e228]:
                          - cell [ref=e229]
                          - cell [ref=e230]
                        - row [ref=e231]:
                          - cell [ref=e232]:
                            - generic [ref=e233]: "14"
                          - cell [ref=e235]
                        - row [ref=e236]:
                          - cell [ref=e237]
                          - cell [ref=e238]
                        - row [ref=e239]:
                          - cell [ref=e240]:
                            - generic [ref=e241]: "15"
                          - cell [ref=e243]
                        - row [ref=e244]:
                          - cell [ref=e245]
                          - cell [ref=e246]
                        - row [ref=e247]:
                          - cell [ref=e248]:
                            - generic [ref=e249]: "16"
                          - cell [ref=e251]
                        - row [ref=e252]:
                          - cell [ref=e253]
                          - cell [ref=e254]
                        - row [ref=e255]:
                          - cell [ref=e256]:
                            - generic [ref=e257]: "17"
                          - cell [ref=e259]
                        - row [ref=e260]:
                          - cell [ref=e261]
                          - cell [ref=e262]
                        - row [ref=e263]:
                          - cell [ref=e264]:
                            - generic [ref=e265]: "18"
                          - cell [ref=e267]
                        - row [ref=e268]:
                          - cell [ref=e269]
                          - cell [ref=e270]
                        - row [ref=e271]:
                          - cell [ref=e272]:
                            - generic [ref=e273]: "19"
                          - cell [ref=e275]
                        - row [ref=e276]:
                          - cell [ref=e277]
                          - cell [ref=e278]
                        - row [ref=e279]:
                          - cell [ref=e280]:
                            - generic [ref=e281]: "20"
                          - cell [ref=e283]
                        - row [ref=e284]:
                          - cell [ref=e285]
                          - cell [ref=e286]
                    - row [ref=e290]:
                      - gridcell [ref=e293]
                      - gridcell [ref=e296]
                      - gridcell [ref=e299]
                      - gridcell [ref=e302]:
                        - generic "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано" [ref=e305] [cursor=pointer]:
                          - generic "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано" [ref=e307]:
                            - generic [ref=e308]: 10:00 - 11:00
                            - generic [ref=e309]: Мария
                      - gridcell [ref=e311]
                      - gridcell [ref=e314]
                      - gridcell [ref=e317]
  - generic: "* * * * *"
  - generic: ": : : : : :"
  - generic [ref=e321]:
    - img "check-circle" [ref=e322]
    - generic [ref=e325]: Занятие перенесено
```

# Test source

```ts
  8   | const lesson = { id: 'lesson-a', startTime: '2026-10-08T07:00:00Z', endTime: '2026-10-08T08:00:00Z', status: 'SCHEDULED',
  9   |   trainer, service, arena: null, bookings: [{ id: 'b1', client, horse, membership: null }] }
  10  | const workloads = (date: string | null, exclude?: string | null) => [
  11  |   { horseId: 'h1', horseName: 'Валдай', currentWorkloadMinutes: date === '2026-10-09' ? 100 : exclude === 'lesson-a' ? 0 : 60,
  12  |     maxDailyWorkloadMinutes: 120, status: 'AVAILABLE' },
  13  |   { horseId: 'h2', horseName: 'Буран', currentWorkloadMinutes: 120, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' },
  14  | ]
  15  | 
  16  | test.beforeEach(async ({ page }) => {
  17  |   await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  18  |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  19  |   await page.route('**/api/bookings/availability?*', route => {
  20  |     const date = new URL(route.request().url()).searchParams.get('from')?.slice(0, 10) || '2026-10-08'
  21  |     return route.fulfill({ json: { date, horseWorkloads: workloads('2026-10-08'), arenaOccupancy: [] } })
  22  |   })
  23  |   await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
  24  |   await page.addInitScript(() => {
  25  |     localStorage.setItem('horsecrm.access_token', 'cookie-session')
  26  |     localStorage.setItem('horsecrm.role', 'ADMIN')
  27  |     localStorage.setItem('horsecrm.email', 'qa@example.com')
  28  |   })
  29  |   await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  30  |   for (const [resource, data] of Object.entries({ clients: [client], horses: [horse, { ...horse, id: 'h2', name: 'Буран', maxDailyMinutes: 240 }], trainers: [trainer], services: [service], arenas: [] })) {
  31  |     await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  32  |   }
  33  |   await page.route('**/api/lessons?*', route => route.fulfill({ json: [lesson] }))
  34  |   await page.route('**/api/horses/workload?*', route => {
  35  |     const params = new URL(route.request().url()).searchParams
  36  |     return route.fulfill({ json: workloads(params.get('date'), params.get('excludeLessonId')) })
  37  |   })
  38  | })
  39  | 
  40  | async function selectOption(page: Page, modal: Locator, label: string, text: string) {
  41  |   await modal.getByLabel(label, { exact: true }).last().click()
  42  |   await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).last().click()
  43  | }
  44  | 
  45  | async function openBooking(page: Page) {
  46  |   await page.goto('/schedule')
  47  |   await openCalendarLesson(page)
  48  |   const modal = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  49  |   await selectOption(page, modal, 'Услуга', 'Выездка')
  50  |   await selectOption(page, modal, 'Тренер', 'Мария')
  51  |   await selectOption(page, modal, 'Клиент', 'Анна Орлова')
  52  |   await selectOption(page, modal, 'Лошадь участника', 'Валдай — 60 / 120 мин')
  53  |   return modal
  54  | }
  55  | 
  56  | for (const width of [1280, 320, 768]) {
  57  |   test(`daily widget, event badge and overload guard at ${width}px`, async ({ page }) => {
  58  |     await page.setViewportSize({ width, height: 900 })
  59  |     const modal = await openBooking(page)
  60  |     const save = modal.getByRole('button', { name: 'Создать занятие', exact: true })
  61  |     await expect(save).toBeEnabled()
  62  |     await modal.getByLabel('Длительность, мин', { exact: true }).fill('61')
  63  |     await expect(modal.getByText('Внимание: суммарная нагрузка лошади составит 121 мин (лимит 120 мин)')).toBeVisible()
  64  |     await expect(save).toBeDisabled()
  65  |     await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  66  |     await modal.locator('.horse-workload-warning').scrollIntoViewIfNeeded()
  67  |     await page.screenshot({ path: `test-results/horse-overload-${width}.png`, animations: 'disabled' })
  68  |     await modal.getByLabel('Длительность, мин', { exact: true }).fill('60')
  69  |     await expect(save).toBeEnabled()
  70  |     await modal.getByRole('button', { name: 'Закрыть шторку', exact: true }).click()
  71  |     await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  72  |     const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 08.10.2026' })
  73  |     await expect(panel.getByText('60 / 120 мин', { exact: true })).toBeVisible()
  74  |     await panel.getByRole('button', { name: 'Close', exact: true }).click()
  75  |     await expect(page.locator('.fc-event .horse-workload-badge')).toHaveCount(0)
  76  |     await page.locator('.fc-event').first().click()
  77  |     const detail = page.getByRole('dialog', { name: 'Карточка занятия' })
  78  |     await expect(detail.locator('.horse-workload-badge').first()).toHaveText('60 / 120 мин')
  79  |     await detail.getByRole('button', { name: 'Close', exact: true }).click()
  80  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  81  |   })
  82  | }
  83  | 
  84  | test('changing booking date recalculates options and blocks overload on the destination day', async ({ page }) => {
  85  |   const modal = await openBooking(page)
  86  |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  87  |   await expect(modal.getByTitle('Валдай — 100 / 120 мин', { exact: true })).toBeVisible()
  88  |   await expect(modal.getByText('Внимание: суммарная нагрузка лошади составит 160 мин (лимит 120 мин)')).toBeVisible()
  89  |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  90  | })
  91  | 
  92  | test('transfer excludes the original lesson, preserves participants and sends only time and duration', async ({ page }) => {
  93  |   let payload: unknown
  94  |   await page.route('**/api/lessons/lesson-a/reschedule', async route => {
  95  |     payload = route.request().postDataJSON()
  96  |     await route.fulfill({ json: { ...lesson, startTime: '2026-10-08T09:00:00Z', endTime: '2026-10-08T11:00:00Z' } })
  97  |   })
  98  |   await page.goto('/schedule')
  99  |   await page.locator('.fc-event').first().click()
  100 |   await page.getByRole('button', { name: 'Перенести занятие', exact: true }).click()
  101 |   const modal = page.getByRole('dialog', { name: 'Перенос занятия', exact: true })
  102 |   await expect(modal.getByText('Доступно: 120 из 120 мин', { exact: true })).toBeVisible()
  103 |   await expect(modal.getByLabel('Лошадь участника', { exact: true })).toBeDisabled()
  104 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-08T12:00')
  105 |   await modal.getByLabel('Длительность, мин', { exact: true }).fill('120')
  106 |   await modal.getByRole('button', { name: 'Сохранить перенос', exact: true }).click()
  107 |   await expect(modal).not.toBeVisible()
> 108 |   expect(payload).toEqual({ startTime: '2026-10-08T09:00:00.000Z', durationMinutes: 120 })
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  109 | })
  110 | 
  111 | test('API failure blocks selected horses, supports retry and empty daily state', async ({ page }) => {
  112 |   const modal = await openBooking(page)
  113 |   let fail = true
  114 |   await page.route('**/api/horses/workload?*', route => route.fulfill(fail
  115 |     ? { status: 500, json: { message: 'Данные временно недоступны' } }
  116 |     : { json: workloads('2026-10-09') }))
  117 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  118 |   await expect(modal.getByText('Не удалось проверить нагрузку лошадей')).toBeVisible()
  119 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  120 |   fail = false
  121 |   await modal.getByRole('button', { name: 'Повторить проверку', exact: true }).click()
  122 |   await expect(modal.getByText('Доступно: 20 из 120 мин')).toBeVisible()
  123 |   await modal.getByRole('button', { name: 'Закрыть шторку', exact: true }).click()
  124 |   await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  125 |   await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { date: '2026-10-08', horseWorkloads: [], arenaOccupancy: [] } }))
  126 |   await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  127 |   const panel = page.getByRole('dialog', { name: /Нагрузка лошадей/ })
  128 |   await panel.getByRole('button', { name: 'Обновить нагрузку', exact: true }).click()
  129 |   await expect(panel.getByText('Лошадей пока нет')).toBeVisible()
  130 | })
  131 | 
  132 | test('calendar date control refreshes the daily widget and navigation updates its date', async ({ page }) => {
  133 |   await page.goto('/schedule')
  134 |   await page.getByLabel('Дата нагрузки', { exact: true }).fill('2026-10-09')
  135 |   await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  136 |   const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 09.10.2026' })
  137 |   await expect(panel.getByText('100 / 120 мин', { exact: true })).toBeVisible()
  138 |   await panel.getByRole('button', { name: 'Close', exact: true }).click()
  139 |   await page.locator('.fc-next-button').click()
  140 |   await expect(page.getByLabel('Дата нагрузки', { exact: true })).not.toHaveValue('2026-10-09')
  141 | })
  142 | 
  143 | test('slow date lookup disables save and a superseded response cannot replace the new date', async ({ page }) => {
  144 |   const modal = await openBooking(page)
  145 |   let release: (() => void) | undefined
  146 |   const gate = new Promise<void>(resolve => { release = resolve })
  147 |   await page.route('**/api/horses/workload?*', async route => {
  148 |     const date = new URL(route.request().url()).searchParams.get('date')
  149 |     if (date === '2026-10-09') await gate
  150 |     await route.fulfill({ json: workloads(date) })
  151 |   })
  152 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  153 |   await expect(modal.locator('.ant-spin-spinning')).toBeVisible()
  154 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  155 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-10T12:00')
  156 |   await expect(modal.getByText('Доступно: 60 из 120 мин')).toBeVisible()
  157 |   release?.()
  158 |   await expect(modal.getByText('Валдай — 60 / 120 мин', { exact: true })).toBeVisible()
  159 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeEnabled()
  160 | })
  161 | 
```