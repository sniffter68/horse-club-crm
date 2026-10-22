# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: horse-workload.spec.ts >> transfer excludes the original lesson, preserves participants and sends only time and duration
- Location: e2e\horse-workload.spec.ts:91:1

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
            - button "Новое бронирование" [ref=e119] [cursor=pointer]
            - button "Новое занятие" [ref=e122] [cursor=pointer]
          - generic [ref=e125]:
            - generic [ref=e126]: Запланировано
            - generic [ref=e128]: Проведено
            - generic [ref=e130]: Неявка
            - generic [ref=e132]: Отменено
          - generic [ref=e140]:
            - generic [ref=e141]:
              - generic [ref=e142]:
                - generic [ref=e143]:
                  - button "Пред" [ref=e144] [cursor=pointer]:
                    - img [ref=e145]: 
                  - button "След" [ref=e146] [cursor=pointer]:
                    - img [ref=e147]: 
                - button "Сегодня" [disabled] [ref=e148]
              - heading "5 – 11 окт. 2026 г." [level=2] [ref=e150]
              - generic [ref=e152]:
                - button "Неделя" [pressed] [ref=e153] [cursor=pointer]
                - button "День" [ref=e154] [cursor=pointer]
            - generic "5 – 11 окт. 2026 г." [ref=e155]:
              - grid [ref=e157]:
                - rowgroup [ref=e158]:
                  - row [ref=e163]:
                    - columnheader "5 октября 2026 г." [ref=e164]:
                      - generic "5 октября 2026 г." [ref=e166] [cursor=pointer]: пн 05.10
                    - columnheader "6 октября 2026 г." [ref=e167]:
                      - generic "6 октября 2026 г." [ref=e169] [cursor=pointer]: вт 06.10
                    - columnheader "7 октября 2026 г." [ref=e170]:
                      - generic "7 октября 2026 г." [ref=e172] [cursor=pointer]: ср 07.10
                    - columnheader "8 октября 2026 г." [ref=e173]:
                      - generic "8 октября 2026 г." [ref=e175] [cursor=pointer]: чт 08.10
                    - columnheader "9 октября 2026 г." [ref=e176]:
                      - generic "9 октября 2026 г." [ref=e178] [cursor=pointer]: пт 09.10
                    - columnheader "10 октября 2026 г." [ref=e179]:
                      - generic "10 октября 2026 г." [ref=e181] [cursor=pointer]: сб 10.10
                    - columnheader "11 октября 2026 г." [ref=e182]:
                      - generic "11 октября 2026 г." [ref=e184] [cursor=pointer]: вс 11.10
                - rowgroup [ref=e185]:
                  - generic [ref=e188]:
                    - table [aria-hidden] [ref=e190]:
                      - rowgroup [ref=e193]:
                        - row [ref=e194]:
                          - cell [ref=e195]:
                            - generic [ref=e196]: "9"
                          - cell [ref=e198]
                        - row [ref=e199]:
                          - cell [ref=e200]
                          - cell [ref=e201]
                        - row [ref=e202]:
                          - cell [ref=e203]:
                            - generic [ref=e204]: "10"
                          - cell [ref=e206]
                        - row [ref=e207]:
                          - cell [ref=e208]
                          - cell [ref=e209]
                        - row [ref=e210]:
                          - cell [ref=e211]:
                            - generic [ref=e212]: "11"
                          - cell [ref=e214]
                        - row [ref=e215]:
                          - cell [ref=e216]
                          - cell [ref=e217]
                        - row [ref=e218]:
                          - cell [ref=e219]:
                            - generic [ref=e220]: "12"
                          - cell [ref=e222]
                        - row [ref=e223]:
                          - cell [ref=e224]
                          - cell [ref=e225]
                        - row [ref=e226]:
                          - cell [ref=e227]:
                            - generic [ref=e228]: "13"
                          - cell [ref=e230]
                        - row [ref=e231]:
                          - cell [ref=e232]
                          - cell [ref=e233]
                        - row [ref=e234]:
                          - cell [ref=e235]:
                            - generic [ref=e236]: "14"
                          - cell [ref=e238]
                        - row [ref=e239]:
                          - cell [ref=e240]
                          - cell [ref=e241]
                        - row [ref=e242]:
                          - cell [ref=e243]:
                            - generic [ref=e244]: "15"
                          - cell [ref=e246]
                        - row [ref=e247]:
                          - cell [ref=e248]
                          - cell [ref=e249]
                        - row [ref=e250]:
                          - cell [ref=e251]:
                            - generic [ref=e252]: "16"
                          - cell [ref=e254]
                        - row [ref=e255]:
                          - cell [ref=e256]
                          - cell [ref=e257]
                        - row [ref=e258]:
                          - cell [ref=e259]:
                            - generic [ref=e260]: "17"
                          - cell [ref=e262]
                        - row [ref=e263]:
                          - cell [ref=e264]
                          - cell [ref=e265]
                        - row [ref=e266]:
                          - cell [ref=e267]:
                            - generic [ref=e268]: "18"
                          - cell [ref=e270]
                        - row [ref=e271]:
                          - cell [ref=e272]
                          - cell [ref=e273]
                        - row [ref=e274]:
                          - cell [ref=e275]:
                            - generic [ref=e276]: "19"
                          - cell [ref=e278]
                        - row [ref=e279]:
                          - cell [ref=e280]
                          - cell [ref=e281]
                        - row [ref=e282]:
                          - cell [ref=e283]:
                            - generic [ref=e284]: "20"
                          - cell [ref=e286]
                        - row [ref=e287]:
                          - cell [ref=e288]
                          - cell [ref=e289]
                    - row [ref=e293]:
                      - gridcell [ref=e296]
                      - gridcell [ref=e299]
                      - gridcell [ref=e302]
                      - gridcell [ref=e305]:
                        - generic "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано" [ref=e308] [cursor=pointer]:
                          - generic "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано" [ref=e310]:
                            - generic [ref=e311]: 10:00 - 11:00
                            - generic [ref=e312]: Мария
                      - gridcell [ref=e314]
                      - gridcell [ref=e317]
                      - gridcell [ref=e320]
  - generic: "* * * * *"
  - generic: ": : : : : :"
  - generic [ref=e324]:
    - img "check-circle" [ref=e325]
    - generic [ref=e328]: Занятие перенесено
```

# Test source

```ts
  7   | const lesson = { id: 'lesson-a', startTime: '2026-10-08T07:00:00Z', endTime: '2026-10-08T08:00:00Z', status: 'SCHEDULED',
  8   |   trainer, service, arena: null, bookings: [{ id: 'b1', client, horse, membership: null }] }
  9   | const workloads = (date: string | null, exclude?: string | null) => [
  10  |   { horseId: 'h1', horseName: 'Валдай', currentWorkloadMinutes: date === '2026-10-09' ? 100 : exclude === 'lesson-a' ? 0 : 60,
  11  |     maxDailyWorkloadMinutes: 120, status: 'AVAILABLE' },
  12  |   { horseId: 'h2', horseName: 'Буран', currentWorkloadMinutes: 120, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' },
  13  | ]
  14  | 
  15  | test.beforeEach(async ({ page }) => {
  16  |   await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  17  |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  18  |   await page.route('**/api/bookings/availability?*', route => {
  19  |     const date = new URL(route.request().url()).searchParams.get('from')?.slice(0, 10) || '2026-10-08'
  20  |     return route.fulfill({ json: { date, horseWorkloads: workloads('2026-10-08'), arenaOccupancy: [] } })
  21  |   })
  22  |   await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
  23  |   await page.addInitScript(() => {
  24  |     localStorage.setItem('horsecrm.access_token', 'cookie-session')
  25  |     localStorage.setItem('horsecrm.role', 'ADMIN')
  26  |     localStorage.setItem('horsecrm.email', 'qa@example.com')
  27  |   })
  28  |   await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  29  |   for (const [resource, data] of Object.entries({ clients: [client], horses: [horse, { ...horse, id: 'h2', name: 'Буран', maxDailyMinutes: 240 }], trainers: [trainer], services: [service], arenas: [] })) {
  30  |     await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  31  |   }
  32  |   await page.route('**/api/lessons?*', route => route.fulfill({ json: [lesson] }))
  33  |   await page.route('**/api/horses/workload?*', route => {
  34  |     const params = new URL(route.request().url()).searchParams
  35  |     return route.fulfill({ json: workloads(params.get('date'), params.get('excludeLessonId')) })
  36  |   })
  37  | })
  38  | 
  39  | async function selectOption(page: Page, modal: Locator, label: string, text: string) {
  40  |   await modal.getByLabel(label, { exact: true }).last().click()
  41  |   await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).last().click()
  42  | }
  43  | 
  44  | async function openBooking(page: Page) {
  45  |   await page.goto('/schedule')
  46  |   await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
  47  |   const modal = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  48  |   await selectOption(page, modal, 'Услуга', 'Выездка')
  49  |   await selectOption(page, modal, 'Тренер', 'Мария')
  50  |   await selectOption(page, modal, 'Клиент', 'Анна Орлова')
  51  |   await selectOption(page, modal, 'Лошадь участника', 'Валдай — 60 / 120 мин')
  52  |   return modal
  53  | }
  54  | 
  55  | for (const width of [1280, 320, 768]) {
  56  |   test(`daily widget, event badge and overload guard at ${width}px`, async ({ page }) => {
  57  |     await page.setViewportSize({ width, height: 900 })
  58  |     const modal = await openBooking(page)
  59  |     const save = modal.getByRole('button', { name: 'Создать занятие', exact: true })
  60  |     await expect(save).toBeEnabled()
  61  |     await modal.getByLabel('Длительность, мин', { exact: true }).fill('61')
  62  |     await expect(modal.getByText('Внимание: суммарная нагрузка лошади составит 121 мин (лимит 120 мин)')).toBeVisible()
  63  |     await expect(save).toBeDisabled()
  64  |     await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  65  |     await modal.locator('.horse-workload-warning').scrollIntoViewIfNeeded()
  66  |     await page.screenshot({ path: `test-results/horse-overload-${width}.png`, animations: 'disabled' })
  67  |     await modal.getByLabel('Длительность, мин', { exact: true }).fill('60')
  68  |     await expect(save).toBeEnabled()
  69  |     await modal.getByRole('button', { name: 'Закрыть шторку', exact: true }).click()
  70  |     await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  71  |     const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 08.10.2026' })
  72  |     await expect(panel.getByText('60 / 120 мин', { exact: true })).toBeVisible()
  73  |     await panel.getByRole('button', { name: 'Close', exact: true }).click()
  74  |     await expect(page.locator('.fc-event .horse-workload-badge')).toHaveCount(0)
  75  |     await page.locator('.fc-event').first().click()
  76  |     const detail = page.getByRole('dialog', { name: 'Карточка занятия' })
  77  |     await expect(detail.locator('.horse-workload-badge').first()).toHaveText('60 / 120 мин')
  78  |     await detail.getByRole('button', { name: 'Close', exact: true }).click()
  79  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  80  |   })
  81  | }
  82  | 
  83  | test('changing booking date recalculates options and blocks overload on the destination day', async ({ page }) => {
  84  |   const modal = await openBooking(page)
  85  |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  86  |   await expect(modal.getByTitle('Валдай — 100 / 120 мин', { exact: true })).toBeVisible()
  87  |   await expect(modal.getByText('Внимание: суммарная нагрузка лошади составит 160 мин (лимит 120 мин)')).toBeVisible()
  88  |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  89  | })
  90  | 
  91  | test('transfer excludes the original lesson, preserves participants and sends only time and duration', async ({ page }) => {
  92  |   let payload: unknown
  93  |   await page.route('**/api/lessons/lesson-a/reschedule', async route => {
  94  |     payload = route.request().postDataJSON()
  95  |     await route.fulfill({ json: { ...lesson, startTime: '2026-10-08T09:00:00Z', endTime: '2026-10-08T11:00:00Z' } })
  96  |   })
  97  |   await page.goto('/schedule')
  98  |   await page.locator('.fc-event').first().click()
  99  |   await page.getByRole('button', { name: 'Перенести занятие', exact: true }).click()
  100 |   const modal = page.getByRole('dialog', { name: 'Перенос занятия', exact: true })
  101 |   await expect(modal.getByText('Доступно: 120 из 120 мин', { exact: true })).toBeVisible()
  102 |   await expect(modal.getByLabel('Лошадь участника', { exact: true })).toBeDisabled()
  103 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-08T12:00')
  104 |   await modal.getByLabel('Длительность, мин', { exact: true }).fill('120')
  105 |   await modal.getByRole('button', { name: 'Сохранить перенос', exact: true }).click()
  106 |   await expect(modal).not.toBeVisible()
> 107 |   expect(payload).toEqual({ startTime: '2026-10-08T09:00:00.000Z', durationMinutes: 120 })
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  108 | })
  109 | 
  110 | test('API failure blocks selected horses, supports retry and empty daily state', async ({ page }) => {
  111 |   const modal = await openBooking(page)
  112 |   let fail = true
  113 |   await page.route('**/api/horses/workload?*', route => route.fulfill(fail
  114 |     ? { status: 500, json: { message: 'Данные временно недоступны' } }
  115 |     : { json: workloads('2026-10-09') }))
  116 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  117 |   await expect(modal.getByText('Не удалось проверить нагрузку лошадей')).toBeVisible()
  118 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  119 |   fail = false
  120 |   await modal.getByRole('button', { name: 'Повторить проверку', exact: true }).click()
  121 |   await expect(modal.getByText('Доступно: 20 из 120 мин')).toBeVisible()
  122 |   await modal.getByRole('button', { name: 'Закрыть шторку', exact: true }).click()
  123 |   await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  124 |   await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { date: '2026-10-08', horseWorkloads: [], arenaOccupancy: [] } }))
  125 |   await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  126 |   const panel = page.getByRole('dialog', { name: /Нагрузка лошадей/ })
  127 |   await panel.getByRole('button', { name: 'Обновить нагрузку', exact: true }).click()
  128 |   await expect(panel.getByText('Лошадей пока нет')).toBeVisible()
  129 | })
  130 | 
  131 | test('calendar date control refreshes the daily widget and navigation updates its date', async ({ page }) => {
  132 |   await page.goto('/schedule')
  133 |   await page.getByLabel('Дата нагрузки', { exact: true }).fill('2026-10-09')
  134 |   await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  135 |   const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 09.10.2026' })
  136 |   await expect(panel.getByText('100 / 120 мин', { exact: true })).toBeVisible()
  137 |   await panel.getByRole('button', { name: 'Close', exact: true }).click()
  138 |   await page.locator('.fc-next-button').click()
  139 |   await expect(page.getByLabel('Дата нагрузки', { exact: true })).not.toHaveValue('2026-10-09')
  140 | })
  141 | 
  142 | test('slow date lookup disables save and a superseded response cannot replace the new date', async ({ page }) => {
  143 |   const modal = await openBooking(page)
  144 |   let release: (() => void) | undefined
  145 |   const gate = new Promise<void>(resolve => { release = resolve })
  146 |   await page.route('**/api/horses/workload?*', async route => {
  147 |     const date = new URL(route.request().url()).searchParams.get('date')
  148 |     if (date === '2026-10-09') await gate
  149 |     await route.fulfill({ json: workloads(date) })
  150 |   })
  151 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  152 |   await expect(modal.locator('.ant-spin-spinning')).toBeVisible()
  153 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  154 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-10T12:00')
  155 |   await expect(modal.getByText('Доступно: 60 из 120 мин')).toBeVisible()
  156 |   release?.()
  157 |   await expect(modal.getByText('Валдай — 60 / 120 мин', { exact: true })).toBeVisible()
  158 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeEnabled()
  159 | })
  160 | 
```