# Доступность лошади по направлениям

Шаг 1, 25.11.2026. У Horse четыре Boolean NOT NULL с DEFAULT true: allowIndividual, allowGroup, allowWalk, allowSpecial. Старые строки получают true при миграции. Create/Update DTO принимают только boolean; PATCH сохраняет пропущенные поля. Список и карточка возвращают все четыре поля без отдельной проекции.

Форма создания/редактирования использует ToggleSettingRow, просмотр — мягкие бейджи активных направлений. Неполный ответ старого API трактуется как разрешение, только явное false вызывает предупреждение. Ант Design Form управляет checked/onChange; Switch имеет id, htmlFor, aria-label и aria-describedby. Вся плашка служит label; дочерние поля расположены отдельно от него и монтируются только при checked. Скрытие не сбрасывает значения родительской формы автоматически.

## Сопоставление услуг

У Service пока нет категории. Функция frontend/src/pages/horses/serviceAvailability.ts выбирает направление по названию и вместимости в следующем порядке:

1. Иппотерапия, фото, мероприятия, экскурсии → allowSpecial.
2. Прогулки, полевые выезды, походы → allowWalk (выездка сюда не относится).
3. Группа/смена или maxCapacity > 1 → allowGroup.
4. Индивидуальные занятия, тренировки, уроки, выездка, конкур, корда → allowIndividual.
5. Прочие услуги → allowSpecial.

Дисциплины Booking: walks → allowWalk, photoshoot → allowSpecial; dressage/jumping/beginners/corde → allowIndividual. По одной дисциплине нельзя определить групповой формат. При добавлении явной категории Service следует заменить эвристику, сохранив ключи флагов.

## API проверки

GET /api/bookings/availability сохраняет старые date, horseWorkloads, arenaOccupancy и status нагрузки. В horseWorkloads добавлено serviceAvailability с четырьмя флагами. Опциональный query serviceDirection принимает один из ключей флагов; serviceType принимает существующую BookingServiceType. Явный serviceDirection имеет приоритет. Если указан тип, строка получает serviceAllowed и warnings (пустой массив или HORSE_SERVICE_DISABLED). Без типа эти два поля отсутствуют.

Это мягкое предупреждение: оно не запрещает POST записи. В LessonDrawer и TriadBookingModal название опции содержит «направление отключено», выбранная лошадь получает текстовую подсказку. Смена услуги обновляет подсказку и запрос availability; устаревшие запросы отменяются. Ограничения здоровья, веса, отдыха, нагрузки и пересечений сохраняются.

## Развёртывание

Prisma Client сгенерирован локально. Миграция backend/prisma/migrations/20261125120000_horse_service_availability/migration.sql подготовлена вручную; применить на сервере `npx prisma migrate deploy` до запуска нового backend. Локальная БД не изменялась.
