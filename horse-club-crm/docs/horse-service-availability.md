# Доступность лошади по направлениям

Шаг 1, 25.11.2026. У Horse четыре Boolean NOT NULL с DEFAULT true: allowIndividual, allowGroup, allowWalk, allowSpecial. Старые строки получают true при миграции. Create/Update DTO принимают только boolean; PATCH сохраняет пропущенные поля. Список и карточка возвращают все четыре поля без отдельной проекции.

Форма создания/редактирования использует ToggleSettingRow, просмотр — мягкие бейджи активных направлений. Неполный ответ старого API трактуется как разрешение, только явное false вызывает предупреждение. Ант Design Form управляет checked/onChange; Switch имеет id, htmlFor, aria-label и aria-describedby. Вся плашка служит label; дочерние поля расположены отдельно от него и монтируются только при checked. Скрытие не сбрасывает значения родительской формы автоматически.

## Сопоставление услуг

Шаг 3, 25.11.2026: у Service есть nullable enum `serviceDirection`: `allowIndividual`, `allowGroup`, `allowWalk`, `allowSpecial`. Это те же ключи, что у флагов Horse. Явное направление имеет приоритет над названием и вместимостью. Старые строки остаются NULL: массовый backfill по эвристике не выполняется.

Для старых услуг без направления функции `backend/src/services/service-direction.ts` и `frontend/src/pages/horses/serviceAvailability.ts` сохраняют следующий fallback:

1. Иппотерапия, фото, мероприятия, экскурсии → allowSpecial.
2. Прогулки, полевые выезды, походы → allowWalk (выездка сюда не относится).
3. Группа/смена или maxCapacity > 1 → allowGroup.
4. Индивидуальные занятия, тренировки, уроки, выездка, конкур, корда → allowIndividual.
5. Прочие услуги → allowSpecial.

Дисциплины Booking: walks → allowWalk, photoshoot → allowSpecial; dressage/jumping/beginners/corde → allowIndividual. TriadBookingModal работает с самостоятельным Booking и дисциплиной, без Service; его сопоставление сохраняется. LessonDrawer использует выбранный Service и отправляет его UUID в availability.

## Форма и формат услуги

Создание и редактирование открываются в общей EntryOverlay-шторке поверх списка. Направление выбирается отдельно от формата: групповая прогулка всё равно проверяет `allowWalk`. Новая услуга по умолчанию индивидуальная, направление `allowIndividual`.

Отдельного `isGroup` в БД нет: единственный источник формата — `maxCapacity`. Значение 1 означает «Индивидуально», > 1 — «Группа до N чел.». ToggleSettingRow при включении устанавливает 4 и раскрывает «Максимум участников» (2–1000); при выключении сохраняется 1. Старые услуги сохраняют вместимость. Поле направления обязательно при сохранении через новую форму; API по-прежнему принимает услуги без направления, PATCH не меняет пропущенные поля.

Биллинг не меняется: `isPerPerson` управляет записью через организатора с умножением цены на число участников; отдельные клиентские записи получают свою стоимость. Формат группы сам по себе не включает и не выключает `isPerPerson`.

## API проверки

GET /api/bookings/availability сохраняет старые date, horseWorkloads, arenaOccupancy и status нагрузки. В horseWorkloads добавлено serviceAvailability с четырьмя флагами. Опциональный query serviceDirection принимает один из ключей флагов; serviceType принимает существующую BookingServiceType. Явный serviceDirection имеет приоритет. Если указан тип, строка получает serviceAllowed и warnings (пустой массив или HORSE_SERVICE_DISABLED). Без типа эти два поля отсутствуют.

Опциональный `serviceId` — UUID услуги. Если он указан, сервер загружает Service в той же транзакции, определяет направление по явному полю либо legacy fallback и использует его вместо query-подсказок. Неизвестный UUID возвращает 404. Без `serviceId` приоритет остаётся `serviceDirection` → `serviceType`. Клиент проверяет UUID перед отправкой.

Это мягкое предупреждение: оно не запрещает POST записи. В LessonDrawer и TriadBookingModal название опции содержит «направление отключено», выбранная лошадь получает текстовую подсказку. Смена услуги обновляет подсказку и запрос availability; устаревшие запросы отменяются. Ограничения здоровья, веса, отдыха, нагрузки и пересечений сохраняются.

## Развёртывание

Prisma Client сгенерирован локально. Миграция backend/prisma/migrations/20261125120000_horse_service_availability/migration.sql подготовлена вручную; применить на сервере `npx prisma migrate deploy` до запуска нового backend. Локальная БД не изменялась.

Для шага 3 дополнительно применить `backend/prisma/migrations/20261125140000_service_direction/migration.sql` перед запуском backend. SQL идемпотентен для повторного запуска через psql (enum создаётся с обработкой duplicate_object, колонка — ADD COLUMN IF NOT EXISTS). Предпочтительно использовать `npx prisma migrate deploy`; при прямом psql нужно также согласовать историю миграций Prisma. Миграция на сервере в рамках задачи не запускалась.
