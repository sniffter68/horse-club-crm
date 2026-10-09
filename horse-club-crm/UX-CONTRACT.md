# UX Contract

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
| Date | Ant/native typed inputs already in flows | schedule/forms | typed / native | locale + keyboard + E2E |
| Form | Ant Design Form + Refine adapters | shared catalog form | create / edit | validation E2E |
| Scrollbar | `frontend/src/index.css` | DESIGN.md | stable-gutter exception | computed style |
| Toast | Ant Design App notification/message | app provider | success / warning / info / error | live region/browser |
| CRUD | Refine resources and shared catalog wrappers | route/resource definitions | return-to-list | full-flow E2E |

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

- Canonical owner: `frontend/src/components/VkProfileLink.tsx`; reused by client and trainer catalogs, Ant Design Modal/Popconfirm primitives.
- ADMIN/MANAGER: generate a five-minute invitation, copy the code/phone confirmation command, open the community bot, refresh linked status, explicitly confirm unlink. TRAINER has read-only catalog access.
- ADMIN lead recipients: configured in «Пользователи»; numeric VK ID or empty value to disable notifications.
- Pessimistic mutations preserve previous status on failure; persistent alerts allow retry. Invitation requests cancel on close/unmount. Modal Escape returns focus to its trigger, and expired codes cannot be copied.
- API/domain contract and deployment requirements: `backend/VK.md`. Runtime/browser evidence: `frontend/e2e/vk-link.spec.ts`.

## Validation

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

### Horse replacement
- Ant Design Modal/Form/Select and App message are reused for future scheduled bookings and legacy lesson participants.
- ADMIN/MANAGER can change only the horse and optional reason. BookingRulesService validates resources in the same serializable transaction; payments, memberships and ledger entries stay attached to the original booking.
- Conflicts preserve selection and reason and show both persistent text and a toast. Missing rider weight requires completing the client card before replacement.

## Cash desk

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
