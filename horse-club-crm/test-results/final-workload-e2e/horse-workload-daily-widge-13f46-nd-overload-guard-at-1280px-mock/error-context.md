# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: horse-workload.spec.ts >> daily widget, event badge and overload guard at 1280px
- Location: e2e\horse-workload.spec.ts:57:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.fill: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: 'Быстрое бронирование' }).getByRole('spinbutton', { name: 'Длительность, мин', exact: true })

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
  - dialog "Быстрое бронирование" [ref=e321]:
    - generic [ref=e323]:
      - button "Закрыть шторку" [ref=e324] [cursor=pointer]:
        - img "close" [ref=e325]
      - generic [ref=e328]: Быстрое бронирование
    - generic [ref=e330]:
      - generic [ref=e332]:
        - generic "Услуга" [ref=e334]: "* Услуга"
        - combobox "* Услуга" [ref=e342]
      - generic [ref=e344]:
        - generic "Тренер" [ref=e346]: "* Тренер"
        - generic "Тренер" [ref=e350] [cursor=pointer]:
          - combobox "Тренер" [ref=e354]
      - generic [ref=e356]:
        - generic "Манеж" [ref=e358]
        - generic [ref=e359]:
          - combobox "Манеж" [ref=e366]
          - generic [ref=e367]: Необязательно для выездного или теоретического занятия.
      - generic [ref=e370]:
        - generic "Время начала" [ref=e372]: "* Время начала"
        - generic [ref=e377]:
          - textbox "* Время начала" [ref=e378]:
            - /placeholder: Выберите дату
            - text: 08.10.2026 09:00
          - generic:
            - img "calendar"
          - button [ref=e379] [cursor=pointer]:
            - img "close-circle" [ref=e380]
      - generic [ref=e384]:
        - generic "Длительность, мин" [ref=e386]: "* Длительность, мин"
        - generic [ref=e390]:
          - generic:
            - button "Increase Value" [ref=e391] [cursor=pointer]:
              - img "up" [ref=e392]
            - button "Decrease Value" [ref=e395] [cursor=pointer]:
              - img "down" [ref=e396]
          - spinbutton "* Длительность, мин" [ref=e400]: "30"
      - heading "Участники" [level=5] [ref=e401]
      - generic [ref=e402]: "Максимум для выбранной услуги и манежа: 1"
      - generic [ref=e403]:
        - generic [ref=e405]:
          - generic [ref=e407]:
            - generic [ref=e408]: Участник 1
            - button "Удалить" [disabled] [ref=e410]
          - generic [ref=e411]:
            - generic [ref=e413]:
              - generic "Клиент" [ref=e415]: "* Клиент"
              - generic "Клиент" [ref=e420] [cursor=pointer]:
                - generic [ref=e422]:
                  - combobox "Клиент" [ref=e424]
                  - generic: Имя или телефон
            - generic [ref=e426]:
              - generic "Лошадь участника" [ref=e428]
              - generic [ref=e429]:
                - combobox "Лошадь участника" [ref=e436]
                - generic [ref=e437]: Оставьте пустым для теоретического занятия или занятия без клубной лошади.
        - button "Добавить участника" [disabled] [ref=e440]
      - button "Создать занятие" [ref=e441] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, type Page } from '@playwright/test'
  2  | 
  3  | export async function openCalendarLesson(page: Page) {
  4  |   await expect(page.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeEnabled()
  5  |   const date = await page.getByRole('textbox', { name: 'Дата нагрузки', exact: true }).inputValue()
  6  |   const column = page.locator(`.fc-timegrid-col[data-date="${date}"]`)
  7  |   const slot = page.locator('.fc-timegrid-slot-lane[data-time]').first()
  8  |   await slot.scrollIntoViewIfNeeded()
  9  |   const bounds = await column.boundingBox()
  10 |   const slotBounds = await slot.boundingBox()
  11 |   if (!bounds || !slotBounds) throw new Error('Calendar day is not visible')
  12 |   await page.mouse.click(bounds.x + bounds.width / 2, slotBounds.y + 1)
  13 |   await expect(page.getByRole('dialog', { name: 'Быстрое бронирование' })).toBeVisible()
> 14 |   await page.getByRole('dialog', { name: 'Быстрое бронирование' }).getByLabel('Длительность, мин', { exact: true }).fill('60')
     |                                                                                                                                        ^ Error: locator.fill: Test timeout of 20000ms exceeded.
  15 | }
  16 | 
```