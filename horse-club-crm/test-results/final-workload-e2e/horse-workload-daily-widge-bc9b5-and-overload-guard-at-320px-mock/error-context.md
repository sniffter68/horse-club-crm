# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: horse-workload.spec.ts >> daily widget, event badge and overload guard at 320px
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
    - button "Открыть меню навигации" [ref=e5] [cursor=pointer]:
      - img "menu" [ref=e7]
      - generic [ref=e10]: Меню
    - generic [ref=e11]:
      - generic [ref=e12]:
        - generic [ref=e13]:
          - button "Включить звуковые пуши о заявках" [ref=e15] [cursor=pointer]
          - button "Уведомления о заявках" [ref=e18] [cursor=pointer]:
            - img "bell" [ref=e20]
        - button "Принять платёж" [ref=e23] [cursor=pointer]:
          - img "plus" [ref=e25]
      - main [ref=e30]:
        - generic [ref=e31]:
          - heading "Расписание занятий" [level=2] [ref=e33]
          - generic [ref=e34]: "Часовой пояс клуба: Europe/Moscow"
          - generic [ref=e37]:
            - generic "Фильтр по тренеру" [ref=e39] [cursor=pointer]:
              - generic [ref=e41]:
                - combobox "Фильтр по тренеру" [ref=e43]
                - generic: Все тренеры
            - generic "Фильтр по лошади" [ref=e45] [cursor=pointer]:
              - generic [ref=e47]:
                - combobox "Фильтр по лошади" [ref=e49]
                - generic: Все лошади
            - generic "Фильтр по манежу" [ref=e51] [cursor=pointer]:
              - generic [ref=e53]:
                - combobox "Фильтр по манежу" [ref=e55]
                - generic: Все манежи
            - button "Обновить" [ref=e57] [cursor=pointer]
            - generic [ref=e60]:
              - text: Дата нагрузки
              - textbox "Дата нагрузки" [ref=e61]: 2026-10-08
            - button "Нагрузка лошадей" [ref=e63] [cursor=pointer]
            - generic "Группировка расписания" [ref=e66] [cursor=pointer]:
              - generic [ref=e68]:
                - combobox "Группировка расписания" [ref=e70]
                - generic "Календарь" [ref=e71]
            - button "Записать на тренировку" [ref=e73] [cursor=pointer]
          - generic [ref=e76]:
            - generic [ref=e77]: Запланировано
            - generic [ref=e79]: Проведено
            - generic [ref=e81]: Неявка
            - generic [ref=e83]: Отменено
          - generic [ref=e91]:
            - generic [ref=e92]:
              - generic [ref=e94]:
                - button "Пред" [ref=e95] [cursor=pointer]:
                  - img [ref=e96]: 
                - button "След" [ref=e97] [cursor=pointer]:
                  - img [ref=e98]: 
              - heading "8 октября 2026 г." [level=2] [ref=e100]
              - button "Сегодня" [disabled] [ref=e102]
            - generic "8 октября 2026 г." [ref=e103]:
              - grid [ref=e105]:
                - rowgroup [ref=e106]:
                  - row [ref=e111]:
                    - columnheader "четверг" [ref=e112]
                - rowgroup [ref=e115]:
                  - generic [ref=e118]:
                    - table [aria-hidden] [ref=e120]:
                      - rowgroup [ref=e123]:
                        - row [ref=e124]:
                          - cell [ref=e125]:
                            - generic [ref=e126]: "9"
                          - cell [ref=e128]
                        - row [ref=e129]:
                          - cell [ref=e130]
                          - cell [ref=e131]
                        - row [ref=e132]:
                          - cell [ref=e133]:
                            - generic [ref=e134]: "10"
                          - cell [ref=e136]
                        - row [ref=e137]:
                          - cell [ref=e138]
                          - cell [ref=e139]
                        - row [ref=e140]:
                          - cell [ref=e141]:
                            - generic [ref=e142]: "11"
                          - cell [ref=e144]
                        - row [ref=e145]:
                          - cell [ref=e146]
                          - cell [ref=e147]
                        - row [ref=e148]:
                          - cell [ref=e149]:
                            - generic [ref=e150]: "12"
                          - cell [ref=e152]
                        - row [ref=e153]:
                          - cell [ref=e154]
                          - cell [ref=e155]
                        - row [ref=e156]:
                          - cell [ref=e157]:
                            - generic [ref=e158]: "13"
                          - cell [ref=e160]
                        - row [ref=e161]:
                          - cell [ref=e162]
                          - cell [ref=e163]
                        - row [ref=e164]:
                          - cell [ref=e165]:
                            - generic [ref=e166]: "14"
                          - cell [ref=e168]
                        - row [ref=e169]:
                          - cell [ref=e170]
                          - cell [ref=e171]
                        - row [ref=e172]:
                          - cell [ref=e173]:
                            - generic [ref=e174]: "15"
                          - cell [ref=e176]
                        - row [ref=e177]:
                          - cell [ref=e178]
                          - cell [ref=e179]
                        - row [ref=e180]:
                          - cell [ref=e181]:
                            - generic [ref=e182]: "16"
                          - cell [ref=e184]
                        - row [ref=e185]:
                          - cell [ref=e186]
                          - cell [ref=e187]
                        - row [ref=e188]:
                          - cell [ref=e189]:
                            - generic [ref=e190]: "17"
                          - cell [ref=e192]
                        - row [ref=e193]:
                          - cell [ref=e194]
                          - cell [ref=e195]
                        - row [ref=e196]:
                          - cell [ref=e197]:
                            - generic [ref=e198]: "18"
                          - cell [ref=e200]
                        - row [ref=e201]:
                          - cell [ref=e202]
                          - cell [ref=e203]
                        - row [ref=e204]:
                          - cell [ref=e205]:
                            - generic [ref=e206]: "19"
                          - cell [ref=e208]
                        - row [ref=e209]:
                          - cell [ref=e210]
                          - cell [ref=e211]
                        - row [ref=e212]:
                          - cell [ref=e213]:
                            - generic [ref=e214]: "20"
                          - cell [ref=e216]
                        - row [ref=e217]:
                          - cell [ref=e218]
                          - cell [ref=e219]
                    - row [ref=e223]:
                      - gridcell [ref=e226]:
                        - generic "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано" [ref=e229] [cursor=pointer]:
                          - generic "10:00 - 11:00 | Мария | Анна Орлова | Валдай | Не оплачено | Выездка | Запланировано" [ref=e231]:
                            - generic [ref=e232]: 10:00 - 11:00
                            - generic [ref=e233]: Мария
  - dialog "Быстрое бронирование" [ref=e236]:
    - generic [ref=e238]:
      - button "Закрыть шторку" [ref=e239] [cursor=pointer]:
        - img "close" [ref=e240]
      - generic [ref=e243]: Быстрое бронирование
    - generic [ref=e245]:
      - generic [ref=e247]:
        - generic "Услуга" [ref=e249]: "* Услуга"
        - combobox "* Услуга" [ref=e257]
      - generic [ref=e259]:
        - generic "Тренер" [ref=e261]: "* Тренер"
        - generic "Тренер" [ref=e265] [cursor=pointer]:
          - combobox "Тренер" [ref=e269]
      - generic [ref=e271]:
        - generic "Манеж" [ref=e273]
        - generic [ref=e274]:
          - combobox "Манеж" [ref=e281]
          - generic [ref=e282]: Необязательно для выездного или теоретического занятия.
      - generic [ref=e285]:
        - generic "Время начала" [ref=e287]: "* Время начала"
        - generic [ref=e292]:
          - textbox "* Время начала" [ref=e293]:
            - /placeholder: Выберите дату
            - text: 08.10.2026 09:00
          - generic:
            - img "calendar"
          - button [ref=e294] [cursor=pointer]:
            - img "close-circle" [ref=e295]
      - generic [ref=e299]:
        - generic "Длительность, мин" [ref=e301]: "* Длительность, мин"
        - generic [ref=e305]:
          - generic:
            - button "Increase Value" [ref=e306] [cursor=pointer]:
              - img "up" [ref=e307]
            - button "Decrease Value" [ref=e310] [cursor=pointer]:
              - img "down" [ref=e311]
          - spinbutton "* Длительность, мин" [ref=e315]: "30"
      - heading "Участники" [level=5] [ref=e316]
      - generic [ref=e317]: "Максимум для выбранной услуги и манежа: 1"
      - generic [ref=e318]:
        - generic [ref=e320]:
          - generic [ref=e322]:
            - generic [ref=e323]: Участник 1
            - button "Удалить" [disabled] [ref=e325]
          - generic [ref=e326]:
            - generic [ref=e328]:
              - generic "Клиент" [ref=e330]: "* Клиент"
              - generic "Клиент" [ref=e335] [cursor=pointer]:
                - generic [ref=e337]:
                  - combobox "Клиент" [ref=e339]
                  - generic: Имя или телефон
            - generic [ref=e341]:
              - generic "Лошадь участника" [ref=e343]
              - generic [ref=e344]:
                - combobox "Лошадь участника" [ref=e351]
                - generic [ref=e352]: Оставьте пустым для теоретического занятия или занятия без клубной лошади.
        - button "Добавить участника" [disabled] [ref=e355]
      - button "Создать занятие" [ref=e356] [cursor=pointer]
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