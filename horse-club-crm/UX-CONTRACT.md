# UX Contract

## Единая запись на тренировку (2026-10-26)

Источник — задача владельца, `docs/unified-lesson-booking.md`. Канонический компонент создания — `schedule/LessonDrawer`, форма — `StableEntryModal`, поля — Ant Design/`BookingDateTimePicker`/`ClientSelectWithCreate`. Дашборд, кнопка расписания, календарь и сетки ресурсов используют его напрямую. Слот задаёт московское время и тренера/манеж; тренер слота имеет приоритет над предпочтениями клиента. Ошибка сохраняет ввод, успех закрывает шторку, обновляет расписание и дашборд. Перенос занятия и редактирование существующего бронирования остаются отдельными операциями. Проверки: `LessonDrawer.test.ts`, `dashboard.spec.ts`.

## Параллельные индивидуальные занятия

Источник — задача владельца от 26.10.2026, `docs/parallel-individual-lessons.md`. Владельцы: `ScheduleEventContent` для карточек, `parallelLayout` для колонок ресурсов, `useScheduleConflicts` и `ScheduleConflictNotice` для подсказок обеих форм. Пересечение тренера не блокирует сохранение; пересечение лошади блокирует. Сервер также проверяет занятость клиента. Учитывается выбранный интервал независимо от фильтров, редактируемая запись исключается, устаревшие запросы отменяются. Визуальные токены не меняются. Проверки: `parallel-lessons.test.cjs`, `booking-rules.test.cjs`, `parallelLayout.test.ts`, `triad-booking.spec.ts`.

## Совместное использование абонементов

Источник — задача владельца от 23.10.2026 и `docs/shared-family-memberships.md`. Канонический владелец управления участниками — `memberships/SharedMembershipAccess.tsx`; поиск — `ClientSelectWithCreate`, подтверждение отзыва — Ant Design Popconfirm, обратная связь — Alert/App message. Ошибка сохраняет выбор; успех обновляет клиентов и абонементы. READ_ONLY скрывает мутации. Обе формы записи показывают владельца семейного абонемента. Проверки — `clients-memberships.spec.ts`, `triad-booking.spec.ts`, `backend/test/shared-memberships.test.cjs`.

## Быстрый перевод денников (2026-10-22)

Быстрый перевод денников описан в `docs/stall-map.md`. Шторка карточки — StableEntryModal/EntryOverlay; подтверждение перевода — Ant Design Modal, выбор — Select, ошибки — Alert, успех — App message. Свободные денники сверху, занятые явно предлагают рокировку; предупреждения рассчитывает backend для обоих мест. Подтверждение недоступно до расчета, UUID проверяются до запроса. Сбой сохраняет выбор, успех обновляет карту без навигации; READ_ONLY скрывает мутации. Проверка: `frontend/e2e/stall-map.spec.ts`.

## Предпочтения клиента для занятий

Канонический владелец селекторов — Ant Design Select в общей форме клиента; автоподстановка обеих форм расписания и быстрой записи с дашборда — `schedule/useClientPreferences.ts`. Автоматический выбор следует смене клиента, ручной выбор и очистка сохраняются до закрытия формы. Редактирование существующего занятия сохраняет его ресурсы. API, миграция и тесты: `docs/client-preferences.md`. Проверка быстрой записи: `docs/dashboard-booking-preferences.md`.

## Архив клиентов и абонементов

Источник: [правила и API архива](docs/client-membership-archive.md), задача владельца от 21.10.2026. Общий владелец подтверждения — `clients/ArchiveAction.tsx` с Ant Modal/App message. Диалог получает полные счётчики истории с сервера, фокусирует отмену, блокирует закрытие и повтор во время запроса, сохраняет ошибку для повторной попытки. Сервер повторно решает hard/soft delete в транзакции. Кнопки мутаций следуют FULL SCHEDULE и ADMIN/MANAGER; кассовые права проверяются отдельно. Архивный клиент отмечен серым бейджем и восстанавливается из фильтра «Архив». Архивный абонемент остаётся в карточке и истории; предупреждение предлагает оформить возврат остатка в кассе. Список сохраняет фильтры и корректирует страницу после удаления. Визуальные токены не меняются. Проверки: `backend/test/archive.test.cjs`, `frontend/e2e/client-archive.spec.ts`, `clients-memberships.spec.ts`.

## Product context

- Audience: администраторы, менеджеры и тренеры конного клуба.
- Primary jobs: расписание занятий, клиенты, лошади, абонементы, оплаты и справочники.
- Target market: Россия.
- Active locales: `ru-RU` / Ant Design `ru_RU`.
- Timezone/calendar policy: `Europe/Moscow`, григорианский календарь.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permission model | `frontend/src/pages/catalogs/permissions.ts`, backend guards | implementation/API evidence | 2026-10-08 |
| Catalog CRUD | `frontend/CATALOGS.md` | maintained product note | 2026-10-08 |
| Schedule lifecycle | `frontend/SCHEDULE.md`, backend lessons API | maintained product note/API | 2026-10-08 |
| Legal/privacy | `COMPLIANCE-RU.md` | compliance checklist | 2026-10-08 |
| Billing/payment | backend payment and membership contracts | API/domain implementation | 2026-10-08 |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: existing runtime canonical.
- Runtime source: `frontend/src/App.tsx` and `frontend/src/index.css`.
- Mapping/adapters: Ant Design `ConfigProvider` plus semantic CSS custom properties.
- Token drift gate: build, strict premium audit and raw-blue grep.
- Supported themes: light Quiet Luxury and retained warm dark mode.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Ant Design Select | Ant Design + this contract | authored | keyboard + popup |
| Date | `BookingDateTimePicker` (Ant Design) for training booking; existing Ant/native inputs elsewhere | owner request, 2026-10-22; schedule/forms | authored booking / typed / native elsewhere | `triad-booking.spec.ts`, `dashboard.spec.ts`, `s3-01.spec.ts` |
| Form | Ant Design Form + Refine adapters | shared catalog form | create / edit | validation E2E |
| Scrollbar | `frontend/src/index.css` | DESIGN.md | stable-gutter exception | computed style |
| Toast | Ant Design App notification/message | app provider | success / warning / info / error | live region/browser |
| CRUD | Refine resources and shared catalog wrappers | route/resource definitions | return-to-list | full-flow E2E |

Publication fields for horses, trainers and services reuse `frontend/src/pages/catalogs/PublicationFields.tsx` inside the existing Ant Design/Refine catalog form. HTTP(S) photo URLs and uploaded `/uploads/<uuid>.<extension>` paths receive inline validation; clearing the field saves `null`. The shared `ImageUploadField` uses native file selection, Ant Design Button/Image and persistent inline errors. Upload is immediate; save waits for completion. Failure/cancellation preserves the previous URL; retry can select the same file. Unmount aborts the request. Publication, description, role and order follow the same save/error/navigation behavior as other catalog fields. Source: `docs/public-landing-content.md`, `docs/image-uploads.md`; verification: `frontend/e2e/public-content.spec.ts`.

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | semantic emphasis | saddle/border emphasis | visible ring | 1px press | muted, inert | stable spinner | intent preserved |
| Input | warm border | stronger border | saddle ring | n/a | muted | stable suffix | inline Ant error |
| Search | clear + submit | shared input | shared input | submit | inert | table loader | page alert |
| Textarea | resize none | shared input | shared input | n/a | muted | form pending | inline Ant error |
| Table/list | hairline rows | warm row | native controls | n/a | n/a | stable loader | persistent alert |

## Dataset navigation

- Admin tables: existing server pagination through Refine.
- URL state: Refine `syncWithLocation` remains authoritative.
- Page size: 10 default, 10/20/50 options where supported.
- States: library loading, explicit empty/no-results and persistent error alert.
- Responsive strategy: semantic table on desktop; existing labeled cards on mobile.

## Flow ledger

Главная панель (`/`): Quick Actions проверяют `canWrite` соответствующего модуля; KPI проверяют `canRead`, сервер фильтрует данные и запросы независимо от клиента. Общий `EntryOverlay` владеет правой шторкой, фокусом и Escape; `StableEntryModal` поддерживает вариант `drawer` с общей защитой черновика, блокировкой повторного сохранения и inline-ошибками. Существующие формы кассы и расхода сохраняют ключ операции для безопасного повтора. Успех закрывает шторку, показывает общий toast и обновляет сводку без навигации. Select/DatePicker остаются Ant Design, дата и время трактуются как московские независимо от часового пояса браузера. Контракт API: `docs/dashboard.md`; проверки: `backend/test/dashboard.test.cjs`, `frontend/e2e/dashboard.spec.ts`.

Модули и права (`/settings`): администратор управляет глобальными флагами и матрицей четырех ролей. Ant Design Switch/Segmented/Modal владеют вводом и подтверждением. Сохранение блокирует повторы, ошибка сохраняет выбор, права ADMIN закреплены. ModuleGuard и общий контекст скрывают недоступные разделы и закрывают прямые ссылки; READ_ONLY сохраняет просмотр и запрещает изменение на сервере. Контракт и тесты: `docs/module-access.md`, `backend/test/module-access.test.cjs`, `frontend/e2e/module-access.spec.ts`, `frontend/e2e/modules.live.spec.ts`.

Персонал (`/staff`): график использует ограниченную месяцем календарную сетку и общий ResponsiveTable на телефоне; расчет и ставки — тот же ResponsiveTable. Ant Design DatePicker/TimePicker/Select владеют вводом, StableEntryModal — сохранением, защитой закрытия и ошибками. Вкладка, месяц, период и страница сохраняются в URL. ADMIN/MANAGER управляют, TRAINER видит только свои данные и не получает вкладку ставок. Выплата подтверждается отдельным диалогом с ФИО, периодом, суммой и способом списания; повтор сохраняет calculationId. Расчет использует expectedUpdatedAt для обнаружения конфликтов. Источник и правила: `docs/staff-payroll.md`, StaffService и guards; проверки: `backend/test/staff.test.cjs`, `backend/test/staff.postgres.test.cjs`, `frontend/e2e/staff.live.spec.ts`.

Ветеринария: `vet-records.tsx` использует общий `StableEntryModal`, `StableListState`, Ant Design Form/Select/DatePicker/Modal и `ResponsiveTable`. Ошибка записи сохраняет поля, повторное сохранение блокируется до завершения запроса, несохранённое закрытие подтверждается. После мутации обновляются журнал, сводка, карточки лошадей и предупреждения расписания. ADMIN/MANAGER управляют записями, ADMIN удаляет с подтверждением, TRAINER читает. Отдельная модальная веткарта загружает всю историю и печатается на А4 независимо от темы и пагинации; JSON скачивается локально. Старый календарь назначений сохраняется отдельной вкладкой. Контракт: `docs/veterinary.md`; проверки: `frontend/e2e/vet-records.spec.ts`, `backend/test/vet-records.test.cjs`.

Карта денников: Ant Design Modal и общий `StableEntryModal`; сохранение закрывает карточку, обновляет карту и показывает общий toast. Ошибка сохраняет форму и выбор лошади. Несохранённые статус/заметки защищены подтверждением закрытия, заселение до их сохранения отключено. TRAINER получает просмотр и печать; ADMIN/MANAGER — управление, с учётом `boardingAccess`. Источник бизнес-правил: `docs/stall-map.md`, backend StallsService/guards; проверка: `frontend/e2e/stall-map.spec.ts`, `backend/test/stall-map.test.cjs`.

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create | Создать | stable busy button | owning list | shared toast | form preserved | list context | shared catalog form |
| Edit | Сохранить | stable busy button | owning list | shared toast | form preserved | list context | shared catalog form |
| Delete | Удалить | dialog action busy | owning list | shared toast | dialog remains/retry | list context | Refine DeleteButton |
| Search | Найти / search input | stable table loading | same route | result table | alert + retry input | search/list | shared catalog list |
| Cancel/back | Отмена / Back | none | origin | none | unsaved behavior unchanged | origin | existing routes |

## Navigation and responsive behavior

- Sidebar/drawer transformation: persistent dark sidebar at desktop; modal left drawer on mobile with focus/escape behavior owned by Ant Design.
- Responsive tables: existing `ResponsiveTable` converts rows to labeled cards below `md`.
- Focus: visible saddle focus treatment; fixed mobile menu reserves top content padding.
- Route title and error behavior remain unchanged in this visual-only migration.

## Overlays and feedback

- Dialog primitive: Ant Design Modal/Popconfirm.
- Toast: Ant Design App provider; semantic tone and existing durations.
- Layer contract: modal > drawer/popover > fixed mobile menu according to Ant Design portals and explicit menu z-index.
- Business behavior, confirmations and unsaved-change policy are unchanged by this redesign.

## Async and resilience

- Existing request cancellation, pessimistic mutations and duplicate-submit guards remain authoritative.
- Visual migration does not change retry, session, conflict or persistence behavior.

### VK profile controls

- Canonical owner: `frontend/src/components/VkProfileLink.tsx`; shared field, badge, profile link and `EntryOverlay` drawer in clients, staff and users.
- ADMIN/MANAGER enter a VK ID or profile URL; the backend resolves aliases and rejects duplicate identities. Empty input unlinks the account. READ_ONLY hides mutations and the API enforces module write access.
- Saving is pessimistic: input and errors remain available on failure; success refreshes the card and closes the drawer. Escape restores focus to the trigger. Pending personal deliveries to the old identity are revoked.
- The embedded webhook and service-token API share direct VK identification. Phone/code verification is retired.
- Business/API contract: `docs/vk-direct-identity.md`, `backend/VK.md`. Runtime evidence: `frontend/e2e/vk-link.spec.ts`.

## Validation

### Lead conversion with immediate training

- Owner: `frontend/src/pages/dashboard/PendingLeads.tsx`; ADMIN-only conversion through `PATCH /leads/:id/accept`.
- «Сразу назначить тренировку» reveals club-local date/time, duration, service, active trainer, available horse and optional location. Ant Design Form/Select/Modal and the existing typed `datetime-local` variant own controls and validation; `schedule/time.ts` converts club wall time to UTC.
- Catalogs load with pagination and cancellation; failures offer retry. Horse availability reuses `useTriadAvailability`; loading, unavailable or failed checks block scheduling. The backend remains authoritative for conflicts, workload, rest, capacity and club hours.
- The primary action changes between «Создать клиента» and «Создать клиента и назначить занятие». Turning scheduling off excludes all lesson fields from the request. The service defaults to the lead's selected service and can be changed.
- Client lookup/creation by phone, lesson participant, pending service charge, VK outbox and lead status `ACCEPTED` commit in one serializable transaction. `ACCEPTED` is the existing converted state; no new status or migration is introduced. This reuses `LessonsService.createLesson` and preserves the existing schedule's grouping and payment rules.
- Busy writes block duplicate requests, closing and editing. Failure preserves input and shows a persistent alert; dirty cancellation asks before discarding. Success closes the modal, removes the lead from the dashboard and invalidates client/lesson/booking lists.
- Evidence: `backend/test/lead-conversion-lesson.test.cjs`, `frontend/src/pages/dashboard/leadConversion.test.ts`, `frontend/e2e/lead-conversion.spec.ts`.

### Quick boarding

- Canonical owner: `frontend/src/pages/boarding-contracts/quick.tsx`, shared by horse and stall detail cards; Ant Design Form/Modal/Select/DatePicker primitives.
- ADMIN/MANAGER can place a horse through date-sensitive availability or explicitly confirm termination. The originating horse/stall is fixed; club placement hides client/rate and submits null/zero, while private placement requires them.
- Feeding notes reuse Ant Design inline Form/Input and existing horse update permissions; failed saves retain the draft, cancel restores saved content, and successful saves refresh the card. Read-only users see the text without edit controls.
- Mutations preserve values on failure, prevent duplicate requests, and invalidate the related cards and lists. Calendar conversion uses the club timezone. Nested modal readiness and close animation preserve focus; mobile body scrolling keeps actions reachable.
- Domain/API contract: `frontend/BOARDING.md`. Browser evidence: `frontend/e2e/quick-boarding.spec.ts`.

- Ant Design Form rules and server mapping remain canonical.
- Existing error timing, value preservation and disabled/busy states are retained.

## Permission and clipboard

- Existing role filtering and dedicated 403 results remain authoritative.
- Visual styles must not imply that hidden/disabled actions are authorized.

## Migration status

- Canonical primitives: Ant Design, Refine, `ResponsiveTable`, shared catalog wrappers.
- Current slice: global theme, navigation, dashboard, clients and schedule status language.
- Rollback: theme/CSS and presentation-only class changes can be reverted without API/data migration.

## Verification

### Triad booking and resource schedule

- Canonical owners: `TriadBookingModal.tsx`, `ResourceSchedule.tsx` and `useTriadAvailability.ts` in `frontend/src/pages/schedule`. Reuse Ant Design Form/Modal/Select and the existing club timezone, palette and typography.
- ADMIN/MANAGER create or edit scheduled standalone bookings; TRAINER reads the schedule. Legacy lesson actions retain their existing flow. Calendar and trainer/horse/arena day groupings show both sources without duplicating legacy booking projections.
- Named date-control variant: the triad form uses an authored Ant Design DatePicker with time selection; existing native date filters remain unchanged. Labels, search, keyboard operation and visible focus are retained. Narrow screens stack the form and scroll the resource board internally.
- Selecting a client displays phone, weight and active lesson/deposit balances. Overweight horses are disabled; changing to an overweight client preserves the horse choice and explains why saving is blocked.
- Availability requests debounce and cancel on interval/client/record changes; stale responses cannot replace current data. Loading or failed availability blocks submission and offers retry. Server rules remain authoritative. HTTP 409 maps codes to inline field errors and Russian notices while preserving all input.
- Writes are pessimistic and guarded against duplicate submission. Busy forms cannot close; abandoning a dirty draft requires explicit confirmation. Success closes the modal and refreshes the selected calendar date, bookings and workload. Scheduled bookings can be edited with their own reservation excluded from validation.
- Horse columns show daily minutes and hatched required-rest intervals; arena columns show peak simultaneous rider count. Event buttons expose full details to keyboard users and open the appropriate detail card.
- Verification: `frontend/e2e/triad-booking.spec.ts`, schedule regression suites, frontend unit/build checks and PostgreSQL booking integration tests. Booking creation does not itself charge a membership or deposit.

### Booking billing and cancellation

- Canonical owner: `BookingLifecycleActions.tsx` inside the standalone booking detail card, using Ant Design Modal/Form/Select/Popconfirm and the existing theme. ADMIN/MANAGER can record outcomes; TRAINER remains read-only. Legacy group lesson actions keep their established API.
- Completion/no-show require confirmation of the debit. Cancellation requires an initiator and trimmed reason, with a prominent late-cancellation warning and an explanation of club compensation. The backend clock decides the final twelve-hour boundary; the warning updates while the form is open.
- Fixed lesson plans debit one lesson; deposits debit the booking price. Without an attached plan, the backend chooses the usable funded plan expiring first. Missing/ineligible/insufficient balances keep the original status and show an actionable inline error.
- Pessimistic requests prevent duplicate submission, closing and editing during a write. Failure retains the card and cancellation draft for retry. Success closes the details and invalidates calendar, workloads, client/membership queries and the client's ledger history. Terminal records have no further lifecycle controls.
- The client ledger reads the canonical journal while supporting legacy response fields. Signed deposit amounts include ₽ and retain decimal precision in storage; standalone training dates and descriptions appear alongside projected historical operations.
- Evidence: backend lifecycle PostgreSQL tests, `frontend/e2e/triad-booking.spec.ts` and `frontend/e2e/clients-memberships.spec.ts`.

- Static: premium strict audit, forbidden-blue grep, lint, typecheck, unit tests, production build.
- Browser: dashboard, clients, schedule; desktop and narrow viewport; light/dark/reduced motion when available.
- Canonical sibling flow: shared catalog list/create/edit.

### UI audit adapter

- `scripts/audit-ui.py` runs the installed premium auditor without rule exclusions. It preserves source positions while recognizing JSX component names and generic arguments. Ant `Form` still owns validation and must declare `noValidate`; `Form.Item` is not an HTML form, and Ant `Select` is not an OS-owned select.
- Native form/select/textarea and `motion.form` remain visible to all upstream rules. Parser regression tests: `scripts/test_audit_ui.py`.

### Horse replacement
- Ant Design Modal/Form/Select and App message are reused for future scheduled bookings and legacy lesson participants.
- ADMIN/MANAGER can change only the horse and optional reason. BookingRulesService validates resources in the same serializable transaction; payments, memberships and ledger entries stay attached to the original booking.
- Conflicts preserve selection and reason and show both persistent text and a toast. Missing rider weight requires completing the client card before replacement.
- «Сменить лошадь» loads server-validated alternatives for the exact booking, including rider weight, daily workload, rest and other participants. Availability is advisory; saving revalidates in the transaction. Loading/errors/empty alternatives block saving, retry preserves recoverable input, and dirty cancellation asks before discarding.
- `HorseIssues.tsx` owns the paginated future-record list shared by the schedule banner and horse cards. The banner includes all dates and ignores calendar filters; horse cards include all upcoming scheduled records for that horse. Legacy lesson times/status are authoritative. TRAINER reads the list; ADMIN/MANAGER can replace horses directly.
- Status and edit forms preview affected future lessons before saving. The horse card supplies quick replacement actions after a status change. Status and assignment events refresh the shared lists and schedule. Group replacements validate the changed rider and total arena capacity, allowing other unavailable horses to be repaired one at a time.
- Evidence: `backend/test/horse-issues.test.cjs`, `backend/test/booking-rules.test.cjs`, `frontend/e2e/horse-replacement.spec.ts`, `frontend/e2e/triad-booking.spec.ts`.

### Role access and lesson ownership

- Canonical policy: `docs/role-access.md`, `backend/src/auth/role-access.ts` and `RoleAccessService`. ADMIN/MANAGER retain replacement in any future scheduled lesson; TRAINER needs the own-lesson permission and a server-verified trainer/account binding. Both replacement and alternative-horse lookup enforce ownership; group lessons use the current lesson trainer.
- UI owner: `frontend/src/access.ts` and `ReplaceHorseAction`; foreign-lesson actions are hidden. Server identity must load before a trainer action is enabled. Backend remains authoritative. Each successful change appends actor, old/new horse, reason and time to transactional history.
- Settings: Ant Design Tabs/Card/Form/Switch/Modal/Select own «Роли и доступ». Only ADMIN edits TRAINER policy and account bindings; admin/manager authority is fixed. Confirmation names role-wide consequences or session revocation. Loading/busy blocks changes; failure preserves drafts with an inline error. The binding card title wraps on mobile.
- Health read/write, boarding access and financial-report read permissions are enforced by server guards and mirrored in navigation/cards. Health/boarding restrictions also sanitize nested responses. Report access grants no financial writes; trainer boarding access grants no contract writes. Only health catalog forms adopt the configurable healthWrite permission.
- Evidence: `backend/test/role-access.test.cjs`, `backend/test/trainer-account-binding.test.cjs`, `frontend/e2e/role-access.spec.ts`; deployment needs the documented migration and trainer bindings.

## Cash desk

- Membership sale owner: `frontend/src/pages/memberships/create.tsx`, shared `EntryOverlay` drawer over `MembershipList`, `ClientSelectWithCreate` and Ant Form/Select/InputNumber/Segmented/DatePicker/App message. Domain/API source: `docs/membership-sales.md`. The service and lesson count recalculate the suggested amount; the final amount permits discounts. CASH/CARD selection, conditional cashbox feedback, persistent errors and safe operation-key retries share the cash desk behavior. Successful sale invalidates client/membership/payment queries and emits `cash-desk-paid`. The client ledger distinguishes the lesson credit from the RUB cash receipt. Evidence: membership-sale backend tests, client display tests and clients-memberships/cash-desk Playwright suites.

- Expense owner: `frontend/src/pages/cash-desk/expenses.tsx`; API and financial semantics: `docs/expenses.md`, `backend/src/payments/finance.controller.ts` and migration `20261018090000_expenses`.
- ADMIN/MANAGER create and read expenses; TRAINER cannot access expense APIs or their summary. Only ADMIN sees cancellation; the confirmation names the expense and explains the balance reversal. Cancellation retains the record and actor in the database.
- Ant Form/InputNumber/Segmented/Select/DatePicker/Modal/App message and ResponsiveTable own the expense flow. Dates use the authored Russian calendar and Moscow conversion. Filters share the cash-book date range and persist method/category/page in URL state.
- Cumulative cash/account balances are distinct from period income/expenses. Category/method filters narrow expense history only. Mutations refresh both balances and history; failures preserve the draft, uncertain retries reuse the operation key, and dirty close requires confirmation.
- Evidence: `backend/test/expenses.test.cjs`, `backend/test/expenses.postgres.test.cjs`, `frontend/e2e/cash-desk.spec.ts`, `frontend/e2e/expenses.live.spec.ts`.

- Owner: `frontend/src/pages/cash-desk`; reusable payment modal via `CashDeskProvider` in the private layout.
- Sources: user cash-desk brief; `backend/src/payments/cash-desk.service.ts`, DTOs and migration `20261009120000_cash_desk`.
- ADMIN/MANAGER receive payments and view the book; backend guards are authoritative. Cashier identity comes from the session.
- Existing Ant Select, Form, Modal, DatePicker and App message own accessibility, focus and feedback. Native popup ownership is not used in the cash desk.
- Modal client search is transient and intentionally absent from the URL (personal data); server search is bounded and stale responses are ignored.
- Book filters and pagination live in URL parameters. Dates are Moscow calendar dates; API end is exclusive.
- A request UUID survives uncertain HTTP outcomes; retry preserves the original payload. Posted cash receipts cannot be edited/deleted through legacy payment CRUD.
- Fixed lesson issuance already credits lessons; receiving payment settles a pending charge without crediting lessons again. Deposit payments increment monetary units. No automatic unfreeze or extension of validity.
- Starting cash is shown separately and excluded from revenue. Payments may be accepted without an open shift; an active cashier shift attaches automatically.
- Success closes the modal, announces change and invalidates balances; schedule and cash book reload on the shared event.
- Browser verification: `frontend/e2e/cash-desk.spec.ts` (desktop/mobile, insufficient tender, SBP, uncertain retry, role denial).
- Quick client selection/creation owner: `frontend/src/components/ClientSelectWithCreate.tsx`, composed with `clients/QuickCreateClientModal.tsx` and Ant Select/Form/Modal. Every client-assignment form offers «+ Постоянный клиент» and «⚡ Разовый гость» to authorized writers, including after no results. Name/phone search seeds the corresponding field; a guest needs only a name. Server policy and deployment: `docs/quick-clients.md`.
- Creation opens above the mounted parent form. Cancel and API failures preserve its draft. Success inserts/selects the returned client, invalidates client queries and restores focus to the selector. Generic services and payment values are retained; a previous client's booking/membership must be reselected. The search is transient, bounded, debounced, IME-safe and cancels stale requests; selected labels survive result refreshes without appearing in unrelated search results. One-time badges reuse `crm-tag--warning`; conversion updates type without changing related records. Browser evidence: `frontend/e2e/dashboard.spec.ts`, `frontend/e2e/cash-desk.spec.ts`.


Учет разовых занятий: стоимость/предоплата переиспользуют `LessonPriceFields`; завершение из расписания и обеих лент дашборда — `CompleteLessonModal`. До подтверждения показываются стоимость, предоплата и остаток; исходный выбор — «Оставить неоплаченным (долг)». После успеха обновляются расписание/дашборд и касса; при ошибке сохраняются выбор и сообщение. При READ_ONLY кассы прием денег недоступен, завершение без оплаты разрешено при FULL расписания. Источник правил: `docs/lesson-payments.md`, DTO и транзакции LessonsService. Проверка: `frontend/e2e/lesson-payments.spec.ts`, `frontend/e2e/dashboard.spec.ts`.
# Групповые экскурсии

В календаре и сетке ресурсов события показывают только московское время начала/окончания и тренера. При отсутствии имени — «Без тренера», для экскурсии без тренера — «Экскурсия (N чел.)». Общий владелец разметки — `schedule/ScheduleEventContent.tsx`; саммари и доступное имя — `scheduleEventPresentation.ts`. Клиент, услуга, лошадь, нагрузка, статусы и финансовые действия доступны в существующей карточке по клику; подсказка содержит краткую сводку. Соседние и одновременные события не перекрывают друг друга; длинные имена обрезаются внутри плашки. Проверки: `frontend/e2e/lesson-payments.spec.ts`, `triad-booking.spec.ts`, `horse-workload.spec.ts`.

Источник: `docs/group-excursions.md`. Общий владелец расчета формы — `LessonPriceFields`; определение услуги с оплатой за человека — `schedule/groupPricing.ts`. Расписание и быстрые действия используют одинаковые поля количества гостей, снимка ставки, итоговой стоимости и предоплаты. Для экскурсии клиент означает организатора группы; лошадь необязательна. Создание и перенос занятия используют `EntryOverlay` в варианте drawer. Сводка расчета и бейдж гостей принадлежат `LessonGroupSummary` / `LessonGroupBadge`. Проверки: `frontend/e2e/lesson-payments.spec.ts`, `backend/test/lesson-payments.test.cjs`.

Отмена/удаление оплаченных услуг: общий владелец — `frontend/src/components/ServiceCancellationAction.tsx`; `schedule/DeleteLessonAction.tsx`, ArchiveAction абонемента, договоры и быстрое освобождение денника используют его. Источник доменных правил — `docs/service-cancellation-refunds.md`, заменяющий прежнее физическое удаление занятия. Ant Design Modal получает сумму с сервера, по умолчанию включает возврат и предзаполняет наличный/банковский счёт; смешанная оплата требует выбора. Пользователь может удержать средства и указать причину. Фокус изначально на «Отмена»; отправка и закрытие блокируются во время мутации, ошибка сохраняет ввод. Успех обновляет Refine-ресурсы кассы/дашборда и прямые HTTP-данные через cash-desk-paid/lesson-deleted. История и связи сохраняются, повтор не возмещает средства снова. Кнопка доступна ADMIN/MANAGER с FULL соответствующего модуля; возврат дополнительно требует FULL CASHBOX. Проверки: backend/test/service-refund.test.cjs, lesson-deletion.test.cjs; frontend/e2e/lesson-payments.spec.ts, client-archive.spec.ts, quick-boarding.spec.ts.

## Уведомления о новых заявках

`LeadNotifications` в авторизованной шапке подключается к `/api/leads/events` только для ADMIN, согласно существующей политике `LeadManagementController` и `PendingLeads`. Событие приводит к общему Ant Design toast с действием «Открыть заявку», тихому звуку и системному уведомлению при разрешении браузера. Действие переводит на `/#pending-leads` и обновляет список. Разрешение запрашивается по кнопке; отказ объясняется в Popover. Переключатель звука хранится в localStorage и синхронизируется между вкладками. При блокировке autoplay доступно действие «Разрешить звук». Источник: задача владельца от 2026-10-21; реализация и ограничения: `docs/lead-notifications.md`; проверки: `frontend/e2e/lead-notifications.spec.ts`, `backend/test/lead-events.test.cjs`.


## Постоянная сессия и уведомления (2026-10-21)

По решению владельца уведомление о новой заявке не исчезает по таймеру: общий Ant Design notification использует duration: 0, закрывается крестиком или действием «Открыть заявку». Системное уведомление использует requireInteraction: true; клик фокусирует вкладку и открывает /#pending-leads. Визуальные токены не меняются.

Канонический владелец обновления сессии — frontend/src/httpClient.ts и POST /api/auth/refresh. При 401 выполняется один тихий refresh и повтор исходного запроса; одновременные запросы разделяют refresh. Сбой сохраняет текущий экран и сессию, показывает ошибку, допускает повтор после восстановления связи. Только явный выход очищает сохранённую сессию и переводит на /login. Отсутствие сохранённого входа по-прежнему ведёт на /login, серверный отзыв прав не обходится. Контракт и ограничения: backend/src/auth/README.md; проверки: providers.test.ts, s3-01.spec.ts, auth.test.cjs, security-hardening.test.cjs.


## Cash management (2026-10-21)

Source: `docs/cash-management.md`; API owner: `CashController` / `CashManagementService`. ADMIN with FULL CASHBOX sees owner actions. `CashManagement` reuses Ant Design Modal for exact typed reset confirmation, EntryOverlay drawer for withdrawal, Form validation, inline Alert errors and shared App toast. Reset focuses the safe action, archives the journal, closes shifts and refreshes balances without navigation/reload; cash-desk-paid owns direct HTTP refresh and Refine payments is invalidated. Uncertain withdrawal retries retain payload and requestId; explicit 4xx allows correction. Browser coverage: `frontend/e2e/cash-desk.spec.ts` at 1440/390px.

## Entity card editing and application scroll ownership (2026-10-21)

Source: owner request; API/rollout: `docs/entity-editing.md`. `AppLayout` owns
viewport height; `main.crm-main` owns page scrolling; Sidebar menu scrolls
independently. The mobile navigation drawer remains the narrow-screen owner.
`CatalogEditAction` / `CatalogDrawerForm` reuse catalog fields, Ant Design
Select/DatePicker (ru_RU), `EntryOverlay` and `StableEntryModal` for card edits.
Success stays in the owning card and refreshes list/detail queries; errors retain
inputs. Existing route-based edits keep their list return behavior. Staff profile
editing uses the same drawer, existing permissions and direct list refresh.
Canonical toast owner: Ant Design App message. Runtime verification:
`frontend/e2e/entity-edit.spec.ts`, `backend/test/entity-edit.test.cjs`.

## Подтверждение даты и времени записи (2026-10-22)

По задаче владельца общий `frontend/src/components/BookingDateTimePicker.tsx` задаёт русскую локаль, `needConfirm`, «Сейчас» и «ОК» для начала/окончания бронирования, быстрой записи из календаря и шторки дашборда. «ОК» применяет выбранную дату и время и закрывает календарь; Escape закрывает календарь, сохраняя открытую форму. Стандартное действие Ant Design «Сейчас» сразу применяет московское время и закрывает календарь. На узком экране footer остаётся закреплён при прокрутке. API и формат хранения не меняются. Проверки: frontend/e2e/triad-booking.spec.ts, dashboard.spec.ts, s3-01.spec.ts.
