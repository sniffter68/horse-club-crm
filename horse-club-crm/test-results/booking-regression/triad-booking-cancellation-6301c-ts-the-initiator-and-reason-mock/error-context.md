# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: triad-booking.spec.ts >> cancellation club explains policy and submits the initiator and reason
- Location: e2e\triad-booking.spec.ts:190:49

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: 'Отмена бронирования' }).getByRole('combobox', { name: 'Инициатор отмены' })
    - locator resolved to <input readonly value="" type="search" role="combobox" unselectable="on" autocomplete="off" aria-required="true" aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" aria-label="Инициатор отмены" id="cancel-booking-booking1_cancelledBy" class="ant-select-selection-search-input" aria-owns="cancel-booking-booking1_cancelledBy_list" aria-controls="cancel-booking-booking1_cancelledBy_list"/>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span title="Клиент" class="ant-select-selection-item">Клиент</span> intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <span title="Клиент" class="ant-select-selection-item">Клиент</span> intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is not stable
  27 × retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <span title="Клиент" class="ant-select-selection-item">Клиент</span> intercepts pointer events
  - retrying click action
    - waiting 500ms

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
              - textbox "Дата нагрузки" [ref=e107]: 2026-10-09
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
                      - gridcell [ref=e305]
                      - gridcell [ref=e308]:
                        - generic "10:00 - 11:00 | Мария Волкова | Анна Орлова | Валдай | Выездка | Запланировано" [ref=e311] [cursor=pointer]:
                          - generic "10:00 - 11:00 | Мария Волкова | Анна Орлова | Валдай | Выездка | Запланировано" [ref=e313]:
                            - generic [ref=e314]: 10:00 - 11:00
                            - generic [ref=e315]: Мария Волкова
                      - gridcell [ref=e317]
                      - gridcell [ref=e320]
  - generic: "* * * * *"
  - generic [ref=e323]:
    - dialog "Карточка бронирования":
      - generic [ref=e324]:
        - button "Close" [ref=e325] [cursor=pointer]:
          - generic "Close" [ref=e326]:
            - img "close" [ref=e327]
        - generic [ref=e330]: Карточка бронирования
        - generic [ref=e333]:
          - generic [ref=e334]: Запланировано
          - table [ref=e339]:
            - rowgroup [ref=e340]:
              - row [ref=e341]:
                - 'cell "Лошадь : Валдай" [ref=e342]':
                  - generic [ref=e343]:
                    - generic [ref=e344]: "Лошадь :"
                    - generic [ref=e345]: Валдай
              - row [ref=e346]:
                - 'cell "Тренер : Мария Волкова" [ref=e347]':
                  - generic [ref=e348]:
                    - generic [ref=e349]: "Тренер :"
                    - generic [ref=e350]: Мария Волкова
              - row [ref=e351]:
                - 'cell "Всадник : Анна Орлова" [ref=e352]':
                  - generic [ref=e353]:
                    - generic [ref=e354]: "Всадник :"
                    - generic [ref=e355]: Анна Орлова
              - row [ref=e356]:
                - 'cell "Локация : Крытый манеж" [ref=e357]':
                  - generic [ref=e358]:
                    - generic [ref=e359]: "Локация :"
                    - generic [ref=e360]: Крытый манеж
              - row [ref=e361]:
                - 'cell "Интервал : 09 окт. 2026, 10:00 — 09 окт. 2026, 11:00" [ref=e362]':
                  - generic [ref=e363]:
                    - generic [ref=e364]: "Интервал :"
                    - generic [ref=e365]: 09 окт. 2026, 10:00 — 09 окт. 2026, 11:00
              - row [ref=e366]:
                - 'cell "Дисциплина : Выездка" [ref=e367]':
                  - generic [ref=e368]:
                    - generic [ref=e369]: "Дисциплина :"
                    - generic [ref=e370]: Выездка
          - button "Сменить лошадь" [ref=e372] [cursor=pointer]
          - region "Исход тренировки" [ref=e375]:
            - generic [ref=e376]:
              - button "Завершить" [ref=e378] [cursor=pointer]
              - button "Неявка (No-show)" [ref=e381] [cursor=pointer]
              - button "Отменить" [ref=e384] [cursor=pointer]
          - button "Редактировать бронирование" [ref=e387] [cursor=pointer]
  - generic [ref=e389]:
    - dialog "Отмена бронирования":
      - generic [ref=e390]:
        - button "Close" [ref=e391] [cursor=pointer]:
          - generic "Close" [ref=e392]:
            - img "close" [ref=e393]
        - generic [ref=e396]: Отмена бронирования
        - generic [ref=e399]:
          - generic [ref=e401]:
            - generic "Инициатор отмены" [ref=e403]: "* Инициатор отмены"
            - generic "Инициатор отмены" [ref=e407] [cursor=pointer]:
              - generic [ref=e409]:
                - combobox "Инициатор отмены" [ref=e411]
                - generic "Клиент" [ref=e412]
          - alert [ref=e413]:
            - img "exclamation-circle" [ref=e414]
            - generic [ref=e417]:
              - generic [ref=e418]: "Внимание: до тренировки менее 12 часов. Будет применено штрафное списание занятия"
              - generic [ref=e419]: С абонемента на занятия спишется 1 занятие, с депозита — 1 500 ₽. Если абонемент не выбран, используется подходящий с ближайшим сроком действия.
          - generic [ref=e421]:
            - generic "Причина отмены" [ref=e423]: "* Причина отмены"
            - generic [ref=e427]:
              - textbox "* Причина отмены" [ref=e428]:
                - /placeholder: "Например: изменение планов клиента"
              - generic: 0 / 1000
          - generic [ref=e429]:
            - button "Подтвердить отмену" [ref=e431] [cursor=pointer]
            - button "Назад" [ref=e434] [cursor=pointer]
```

# Test source

```ts
  100 |     if (label === 'По лошадям') { await expect(page.getByText('Отдых 45 мин', { exact: true })).toBeVisible(); await expect(page.getByText('60 / 120 мин', { exact: true })).toBeVisible() }
  101 |     if (label === 'По локациям') await expect(page.getByText('Пик за день: 2 / 6 всадников')).toBeVisible()
  102 |   }
  103 | })
  104 | test('edits a scheduled booking through PATCH, excluding its own reservation from availability', async ({ page }) => {
  105 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  106 |   let excluded = false
  107 |   await page.route('**/api/bookings/availability?*', route => { excluded ||= new URL(route.request().url()).searchParams.get('excludeBookingId') === 'booking1'; return route.fulfill({ json: { date: '2026-10-09', horseWorkloads: [], arenaOccupancy: [] } }) })
  108 |   await page.route('**/api/bookings/booking1', route => { expect(route.request().method()).toBe('PATCH'); return route.fulfill({ json: booking }) })
  109 |   await page.goto('/schedule'); await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  110 |   await page.getByRole('button', { name: 'Редактировать бронирование' }).click()
  111 |   const modal = page.getByRole('dialog', { name: 'Редактирование бронирования' })
  112 |   await modal.getByLabel('Стоимость, ₽', { exact: true }).fill('2000')
  113 |   await modal.getByRole('button', { name: 'Сохранить бронирование' }).click()
  114 |   await expect(modal).toHaveCount(0); expect(excluded).toBe(true)
  115 | })
  116 | for (const width of [320, 768]) test(`modal, authored select and resource board fit ${width}px`, async ({ page }) => {
  117 |   await page.setViewportSize({ width, height: 900 })
  118 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  119 |   const modal = await openFilled(page)
  120 |   await modal.getByRole('combobox', { name: 'Локация', exact: true }).focus()
  121 |   await page.keyboard.press('ArrowDown')
  122 |   await expect(page.locator('.ant-select-dropdown:visible').filter({ hasText: 'Крытый манеж' })).toBeVisible()
  123 |   await page.screenshot({ path: `test-results/triad-modal-${width}.png`, animations: 'disabled' })
  124 |   await page.keyboard.press('Escape')
  125 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  126 |   await modal.getByLabel('Начало', { exact: true }).click()
  127 |   const picker = page.locator('.triad-date-popup:visible')
  128 |   await expect(picker).toBeVisible()
  129 |   const bounds = await picker.boundingBox()
  130 |   expect(bounds!.x).toBeGreaterThanOrEqual(0)
  131 |   expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
  132 |   await page.screenshot({ path: `test-results/triad-date-${width}.png`, animations: 'disabled' })
  133 |   await page.keyboard.press('Escape')
  134 |   await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
  135 |   await page.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click()
  136 |   const grouping = page.getByRole('combobox', { name: 'Группировка расписания' })
  137 |   await grouping.focus(); await page.keyboard.press('ArrowDown')
  138 |   await page.getByTitle('По лошадям', { exact: true }).click()
  139 |   await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  140 |   await expect(page.getByRole('region', { name: 'Расписание по ресурсам' })).toBeVisible()
  141 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  142 |   await page.screenshot({ path: `test-results/triad-board-${width}.png`, animations: 'disabled' })
  143 |   await page.getByRole('region', { name: 'Расписание по ресурсам' }).scrollIntoViewIfNeeded()
  144 |   await page.screenshot({ path: `test-results/triad-board-detail-${width}.png`, animations: 'disabled' })
  145 | })
  146 | 
  147 | test('availability failure retains the draft and supports retry', async ({ page }) => {
  148 |   let fails = true
  149 |   await page.route('**/api/bookings/availability?*', route => route.fulfill(fails
  150 |     ? { status: 503, json: { message: 'Временная недоступность' } }
  151 |     : { json: { date: '2026-10-09', horseWorkloads: [], arenaOccupancy: [] } }))
  152 |   const modal = await openFilled(page)
  153 |   await expect(modal.getByRole('button', { name: 'Создать бронирование' })).toBeDisabled()
  154 |   fails = false
  155 |   await modal.getByRole('button', { name: /Повторить/ }).click()
  156 |   await expect(modal.getByRole('button', { name: 'Создать бронирование' })).toBeEnabled()
  157 |   await expect(modal.getByRole('combobox', { name: 'Клиент', exact: true })).toBeVisible()
  158 | })
  159 | 
  160 | test('trainer reads resource schedule without mutation controls', async ({ page }) => {
  161 |   await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  162 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  163 |   await page.goto('/schedule')
  164 |   await expect(page.getByRole('button', { name: 'Новое бронирование' })).toHaveCount(0)
  165 |   await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  166 |   await expect(page.getByRole('dialog', { name: 'Карточка бронирования' })).toBeVisible()
  167 |   await expect(page.getByRole('button', { name: 'Редактировать бронирование' })).toHaveCount(0)
  168 |   for (const name of ['Завершить', 'Неявка (No-show)', 'Отменить']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  169 | })
  170 | 
  171 | for (const [action, label, confirmation, status, statusLabel] of [
  172 |   ['complete', 'Завершить', 'Завершить и списать', 'completed', 'Проведено'],
  173 |   ['no-show', 'Неявка (No-show)', 'Зафиксировать неявку', 'no_show', 'Неявка'],
  174 | ]) test(`lifecycle ${action} confirms billing, refreshes calendar and locks the terminal outcome`, async ({ page }) => {
  175 |   let current = booking
  176 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [current], headers: { 'x-total-count': '1' } }))
  177 |   await page.route(`**/api/bookings/booking1/${action}`, route => { expect(route.request().method()).toBe('PATCH'); current = { ...booking, status }; return route.fulfill({ json: current }) })
  178 |   await page.goto('/schedule'); await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  179 |   const detail = page.getByRole('dialog', { name: 'Карточка бронирования' })
  180 |   await detail.getByRole('button', { name: label, exact: true }).click()
  181 |   await expect(page.getByText(/С абонемента на занятия спишется 1 занятие/)).toBeVisible()
  182 |   await page.getByRole('button', { name: confirmation, exact: true }).click()
  183 |   await expect(detail).not.toBeVisible()
  184 |   await expect(page.locator('.fc-event').first()).toHaveAttribute('title', new RegExp(statusLabel))
  185 |   await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  186 |   await expect(detail.getByRole('button', { name: 'Завершить', exact: true })).toHaveCount(0)
  187 |   await expect(detail.getByRole('button', { name: 'Редактировать бронирование' })).toBeDisabled()
  188 | })
  189 | 
  190 | for (const kind of ['penalty', 'free', 'club']) test(`cancellation ${kind} explains policy and submits the initiator and reason`, async ({ page }) => {
  191 |   await page.clock.setFixedTime(new Date(kind === 'free' ? '2026-10-08T18:00:00Z' : '2026-10-09T02:00:00Z'))
  192 |   let payload: unknown
  193 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  194 |   await page.route('**/api/bookings/booking1/cancel', route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { ...booking, status: kind === 'club' ? 'cancelled_club' : kind === 'free' ? 'cancelled_client' : 'penalty_cancellation' } }) })
  195 |   await page.goto('/schedule'); await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  196 |   await page.getByRole('dialog', { name: 'Карточка бронирования' }).getByRole('button', { name: 'Отменить', exact: true }).click()
  197 |   const modal = page.getByRole('dialog', { name: 'Отмена бронирования' })
  198 |   if (kind === 'club') {
  199 |     const initiator = modal.getByRole('combobox', { name: 'Инициатор отмены' })
> 200 |     await initiator.click()
      |                     ^ Error: locator.click: Test timeout of 20000ms exceeded.
  201 |     await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^Клуб$/ }).click()
  202 |     await expect(modal.getByText(/Привязанный абонемент продлится на 7 дней/)).toBeVisible()
  203 |   }
  204 |   if (kind === 'penalty') await expect(modal.getByRole('alert').filter({ hasText: 'менее 12 часов' })).toBeVisible()
  205 |   else await expect(modal.getByText(/Будет применено штрафное списание занятия/)).toHaveCount(0)
  206 |   await modal.getByLabel('Причина отмены', { exact: true }).fill(' Изменение планов ')
  207 |   await modal.getByRole('button', { name: 'Подтвердить отмену' }).click()
  208 |   await expect(modal).not.toBeVisible()
  209 |   expect(payload).toEqual({ cancelledBy: kind === 'club' ? 'club' : 'client', reason: 'Изменение планов' })
  210 | })
  211 | 
  212 | test('billing conflict keeps details open and permits an idempotent retry', async ({ page }) => {
  213 |   let calls = 0
  214 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  215 |   await page.route('**/api/bookings/booking1/complete', route => route.fulfill(++calls === 1
  216 |     ? { status: 409, json: { code: 'MEMBERSHIP_INSUFFICIENT', message: 'Недостаточно занятий или средств на абонементе' } }
  217 |     : { json: { ...booking, status: 'completed' } }))
  218 |   await page.goto('/schedule'); await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  219 |   const detail = page.getByRole('dialog', { name: 'Карточка бронирования' })
  220 |   for (let attempt = 0; attempt < 2; attempt++) {
  221 |     await detail.getByRole('button', { name: 'Завершить', exact: true }).click()
  222 |     await page.getByRole('button', { name: 'Завершить и списать', exact: true }).click()
  223 |     if (!attempt) await expect(detail.getByRole('alert')).toContainText('Недостаточно занятий')
  224 |   }
  225 |   await expect(detail).not.toBeVisible(); expect(calls).toBe(2)
  226 | })
  227 | 
  228 | test('mobile cancellation validates reason and retains it on API failure', async ({ page }) => {
  229 |   await page.setViewportSize({ width: 320, height: 900 })
  230 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  231 |   await page.route('**/api/bookings/booking1/cancel', route => route.fulfill({ status: 409, json: { message: 'Недостаточно занятий или средств на абонементе' } }))
  232 |   await page.goto('/schedule'); await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  233 |   await page.getByRole('dialog', { name: 'Карточка бронирования' }).getByRole('button', { name: 'Отменить', exact: true }).click()
  234 |   const modal = page.getByRole('dialog', { name: 'Отмена бронирования' })
  235 |   await modal.getByRole('button', { name: 'Подтвердить отмену' }).click()
  236 |   await expect(modal.getByText('Укажите причину отмены')).toBeVisible()
  237 |   await modal.getByLabel('Причина отмены', { exact: true }).fill('Изменение планов')
  238 |   await modal.getByRole('button', { name: 'Подтвердить отмену' }).click()
  239 |   await expect(modal.getByRole('alert').filter({ hasText: 'Недостаточно занятий' })).toBeVisible()
  240 |   await expect(modal.getByLabel('Причина отмены', { exact: true })).toHaveValue('Изменение планов')
  241 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  242 |   await page.screenshot({ path: 'test-results/booking-cancellation-320.png', animations: 'disabled' })
  243 | })
  244 | 
  245 | test('pending billing prevents closing, editing and duplicate status requests', async ({ page }) => {
  246 |   let resolve!: () => void, calls = 0
  247 |   const gate = new Promise<void>(done => { resolve = done })
  248 |   await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  249 |   await page.route('**/api/bookings/booking1/complete', async route => { calls++; await gate; await route.fulfill({ json: { ...booking, status: 'completed' } }) })
  250 |   await page.goto('/schedule'); await page.locator('.fc-event').filter({ has: page.locator('[title*="Валдай"]') }).click()
  251 |   const detail = page.getByRole('dialog', { name: 'Карточка бронирования' })
  252 |   await detail.getByRole('button', { name: 'Завершить', exact: true }).click()
  253 |   await page.getByRole('button', { name: 'Завершить и списать' }).click()
  254 |   await expect(detail.getByRole('button', { name: 'Редактировать бронирование' })).toBeDisabled()
  255 |   await page.keyboard.press('Escape'); await expect(detail).toBeVisible()
  256 |   expect(calls).toBe(1); resolve(); await expect(detail).not.toBeVisible()
  257 | })
  258 | 
  259 | test('resource selectors support pointer selection after asynchronous balance loading', async ({ page }) => {
  260 |   await page.goto('/schedule')
  261 |   await page.getByRole('button', { name: 'Новое бронирование', exact: true }).click()
  262 |   const modal = page.getByRole('dialog', { name: 'Бронирование тройного ресурса', exact: true })
  263 |   for (const [field, label] of [['Клиент', 'Анна Орлова'], ['Лошадь', 'Валдай'], ['Тренер', 'Мария Волкова'], ['Локация', 'Крытый манеж']]) {
  264 |     await modal.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: field, exact: true }) }).click()
  265 |     await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).first().click()
  266 |     await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  267 |     if (field === 'Клиент') await expect(modal.getByText('5 / 8 занятий', { exact: true })).toBeVisible()
  268 |   }
  269 |   await expect(modal.getByRole('button', { name: 'Создать бронирование' })).toBeEnabled()
  270 | })
  271 | 
  272 | for (const width of [1280, 375]) {
  273 |   test(`replaces horse after Rules Engine conflict at ${width}px`, async ({ page }) => {
  274 |     await page.setViewportSize({ width, height: 900 })
  275 |     let attempts = 0
  276 |     let current = booking
  277 |     await page.route('**/api/bookings?*', route => route.fulfill({ json: [current], headers: { 'x-total-count': '1' } }))
  278 |     await page.route('**/api/bookings/booking1/horse', async route => {
  279 |       expect(route.request().method()).toBe('PATCH')
  280 |       expect(route.request().postDataJSON()).toEqual({ horseId: 'h2', reason: 'Хромота' })
  281 |       attempts++
  282 |       if (attempts === 1) return route.fulfill({ status: 409, json: { code: 'HORSE_REST_VIOLATION', message: 'Лошадь не успеет отдохнуть' } })
  283 |       current = { ...booking, horseId: 'h2', horse: { ...horse, id: 'h2', name: 'Буран' } }
  284 |       return route.fulfill({ json: current })
  285 |     })
  286 |     await page.goto('/schedule')
  287 |     await page.locator('.fc-event').first().click()
  288 |     await page.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  289 |     const dialog = page.getByRole('dialog', { name: 'Сменить лошадь', exact: true })
  290 |     await choose(page, dialog, 'Новая лошадь', 'Буран')
  291 |     await dialog.getByLabel('Причина замены').fill('Хромота')
  292 |     await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  293 |     await expect(dialog.getByRole('alert')).toContainText('Лошадь не успеет отдохнуть')
  294 |     await expect(dialog.getByLabel('Причина замены')).toHaveValue('Хромота')
  295 |     await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  296 |     await expect(dialog).not.toBeVisible()
  297 |     await expect(page.locator('.fc-event').filter({ has: page.locator('[title*="Буран"]') }).first()).toBeVisible()
  298 |     expect(attempts).toBe(2)
  299 |   })
  300 | }
```