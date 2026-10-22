# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: horse-workload.spec.ts >> slow date lookup disables save and a superseded response cannot replace the new date
- Location: e2e\horse-workload.spec.ts:142:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: 'Быстрое бронирование' }).locator('.ant-spin-spinning')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('dialog', { name: 'Быстрое бронирование' }).locator('.ant-spin-spinning') with timeout 5000ms
  - waiting for getByRole('dialog', { name: 'Быстрое бронирование' }).locator('.ant-spin-spinning')

```

```yaml
- complementary:
  - link "Horse Club OS — главная":
    - /url: /
    - text: Horse Club OS
  - button "Включить тёмную тему":
    - img "moon"
  - menu:
    - menuitem "unordered-list Дашборд":
      - img "unordered-list"
      - link "Дашборд":
        - /url: /
    - menuitem "calendar Занятия":
      - img "calendar"
      - text: Занятия
    - menuitem "credit-card Клиенты и финансы":
      - img "credit-card"
      - text: Клиенты и финансы
    - menuitem "home Лошади и постой":
      - img "home"
      - text: Лошади и постой
    - menuitem "team Клуб и команда":
      - img "team"
      - text: Клуб и команда
    - menuitem "setting Администрирование":
      - img "setting"
      - text: Администрирование
    - menuitem "logout Выход":
      - img "logout"
      - text: Выход
  - img "left"
- button "Включить звуковые пуши о заявках"
- button "Уведомления о заявках":
  - img "bell"
- button "Принять платёж":
  - img "plus"
  - text: Принять платёж
- main:
  - heading "Расписание занятий" [level=2]
  - text: "Часовой пояс клуба: Europe/Moscow"
  - combobox "Фильтр по тренеру"
  - text: Все тренеры
  - combobox "Фильтр по лошади"
  - text: Все лошади
  - combobox "Фильтр по манежу"
  - text: Все манежи
  - button "Обновить"
  - text: Дата нагрузки
  - textbox "Дата нагрузки": 2026-10-08
  - button "Нагрузка лошадей"
  - combobox "Группировка расписания"
  - text: Календарь
  - button "Новое бронирование"
  - button "Новое занятие"
  - text: Запланировано Проведено Неявка Отменено
  - button "Пред":
    - img: 
  - button "След":
    - img: 
  - button "Сегодня" [disabled]
  - heading "5 – 11 окт. 2026 г." [level=2]
  - button "Неделя" [pressed]
  - button "День"
  - grid:
    - rowgroup:
      - row "5 октября 2026 г. 6 октября 2026 г. 7 октября 2026 г. 8 октября 2026 г. 9 октября 2026 г. 10 октября 2026 г. 11 октября 2026 г.":
        - columnheader "5 октября 2026 г.": пн 05.10
        - columnheader "6 октября 2026 г.": вт 06.10
        - columnheader "7 октября 2026 г.": ср 07.10
        - columnheader "8 октября 2026 г.": чт 08.10
        - columnheader "9 октября 2026 г.": пт 09.10
        - columnheader "10 октября 2026 г.": сб 10.10
        - columnheader "11 октября 2026 г.": вс 11.10
    - rowgroup:
      - row "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано":
        - gridcell
        - gridcell
        - gridcell
        - gridcell "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано": 10:00 - 11:00 Мария
        - gridcell
        - gridcell
        - gridcell
- dialog "Быстрое бронирование":
  - button "Закрыть шторку":
    - img "close"
  - text: Быстрое бронирование * Услуга
  - combobox "* Услуга"
  - text: Выездка * Тренер
  - combobox "Тренер"
  - text: Мария Манеж
  - combobox "Манеж"
  - text: Необязательно для выездного или теоретического занятия. * Время начала
  - textbox "* Время начала" [invalid]:
    - /placeholder: Выберите дату
    - text: 2026-10-09T12:00
  - img "calendar"
  - button "close-circle":
    - img "close-circle"
  - text: "* Длительность, мин"
  - button "Increase Value":
    - img "up"
  - button "Decrease Value":
    - img "down"
  - spinbutton "* Длительность, мин": "60"
  - heading "Участники" [level=5]
  - text: "Максимум для выбранной услуги и манежа: 2 Участник 1"
  - button "Удалить" [disabled]
  - text: "* Клиент"
  - combobox "Клиент"
  - text: Анна Орлова · без телефона Лошадь участника
  - combobox "Лошадь участника"
  - text: "Валдай — 60 / 120 мин Оставьте пустым для теоретического занятия или занятия без клубной лошади. Доступно: 60 из 120 мин"
  - progressbar: 50%
  - button "Добавить участника"
  - text: "* Стоимость услуги (₽)"
  - button "Increase Value":
    - img "up"
  - button "Decrease Value" [disabled]:
    - img "down"
  - spinbutton "* Стоимость услуги (₽)": "0.00"
  - switch "Внесена предоплата"
  - text: Внесена предоплата
  - button "Создать занятие"
- button "Предыдущий год (Control + left)"
- button "Предыдущий месяц (PageUp)"
- button "Выбрать месяц": Окт
- button "Выбрать год": "2026"
- button "Следующий месяц (PageDown)"
- button "Следующий год (Control + right)"
- table:
  - rowgroup:
    - row "Пн Вт Ср Чт Пт Сб Вс":
      - columnheader "Пн"
      - columnheader "Вт"
      - columnheader "Ср"
      - columnheader "Чт"
      - columnheader "Пт"
      - columnheader "Сб"
      - columnheader "Вс"
  - rowgroup:
    - row "28 29 30 1 2 3 4":
      - cell "28"
      - cell "29"
      - cell "30"
      - cell "1"
      - cell "2"
      - cell "3"
      - cell "4"
    - row "5 6 7 8 9 10 11":
      - cell "5"
      - cell "6"
      - cell "7"
      - cell "8"
      - cell "9"
      - cell "10"
      - cell "11"
    - row "12 13 14 15 16 17 18":
      - cell "12"
      - cell "13"
      - cell "14"
      - cell "15"
      - cell "16"
      - cell "17"
      - cell "18"
    - row "19 20 21 22 23 24 25":
      - cell "19"
      - cell "20"
      - cell "21"
      - cell "22"
      - cell "23"
      - cell "24"
      - cell "25"
    - row "26 27 28 29 30 31 1":
      - cell "26"
      - cell "27"
      - cell "28"
      - cell "29"
      - cell "30"
      - cell "31"
      - cell "1"
    - row "2 3 4 5 6 7 8":
      - cell "2"
      - cell "3"
      - cell "4"
      - cell "5"
      - cell "6"
      - cell "7"
      - cell "8"
- text: 09:00
- list:
  - listitem: "00"
  - listitem: "01"
  - listitem: "02"
  - listitem: "03"
  - listitem: "04"
  - listitem: "05"
  - listitem: "06"
  - listitem: "07"
  - listitem: "08"
  - listitem: "09"
  - listitem: "10"
  - listitem: "11"
  - listitem: "12"
  - listitem: "13"
  - listitem: "14"
  - listitem: "15"
  - listitem: "16"
  - listitem: "17"
  - listitem: "18"
  - listitem: "19"
  - listitem: "20"
  - listitem: "21"
  - listitem: "22"
  - listitem: "23"
- list:
  - listitem: "00"
  - listitem: "01"
  - listitem: "02"
  - listitem: "03"
  - listitem: "04"
  - listitem: "05"
  - listitem: "06"
  - listitem: "07"
  - listitem: "08"
  - listitem: "09"
  - listitem: "10"
  - listitem: "11"
  - listitem: "12"
  - listitem: "13"
  - listitem: "14"
  - listitem: "15"
  - listitem: "16"
  - listitem: "17"
  - listitem: "18"
  - listitem: "19"
  - listitem: "20"
  - listitem: "21"
  - listitem: "22"
  - listitem: "23"
  - listitem: "24"
  - listitem: "25"
  - listitem: "26"
  - listitem: "27"
  - listitem: "28"
  - listitem: "29"
  - listitem: "30"
  - listitem: "31"
  - listitem: "32"
  - listitem: "33"
  - listitem: "34"
  - listitem: "35"
  - listitem: "36"
  - listitem: "37"
  - listitem: "38"
  - listitem: "39"
  - listitem: "40"
  - listitem: "41"
  - listitem: "42"
  - listitem: "43"
  - listitem: "44"
  - listitem: "45"
  - listitem: "46"
  - listitem: "47"
  - listitem: "48"
  - listitem: "49"
  - listitem: "50"
  - listitem: "51"
  - listitem: "52"
  - listitem: "53"
  - listitem: "54"
  - listitem: "55"
  - listitem: "56"
  - listitem: "57"
  - listitem: "58"
  - listitem: "59"
- list:
  - listitem: Сейчас
  - listitem:
    - button "ОК"
```

# Test source

```ts
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
  107 |   expect(payload).toEqual({ startTime: '2026-10-08T09:00:00.000Z', durationMinutes: 120 })
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
> 152 |   await expect(modal.locator('.ant-spin-spinning')).toBeVisible()
      |                                                     ^ Error: expect(locator).toBeVisible() failed
  153 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  154 |   await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-10T12:00')
  155 |   await expect(modal.getByText('Доступно: 60 из 120 мин')).toBeVisible()
  156 |   release?.()
  157 |   await expect(modal.getByText('Валдай — 60 / 120 мин', { exact: true })).toBeVisible()
  158 |   await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeEnabled()
  159 | })
  160 | 
```