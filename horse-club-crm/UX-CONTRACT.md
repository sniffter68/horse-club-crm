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

- Static: premium strict audit, forbidden-blue grep, lint, typecheck, unit tests, production build.
- Browser: dashboard, clients, schedule; desktop and narrow viewport; light/dark/reduced motion when available.
- Canonical sibling flow: shared catalog list/create/edit.
