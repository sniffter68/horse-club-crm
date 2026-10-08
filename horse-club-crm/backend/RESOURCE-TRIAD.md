# Horse Club OS: resource triad and billing lifecycle

The additive migration `20261008200000_init_resource_triad_and_boarding` introduces
the requested enums, physiological fields, decimal memberships, standalone resource
triad bookings and LedgerTransaction. Existing IDs, relations and operations remain.
Foreign keys, interval/capacity/unit checks and three partial scheduled-resource
indexes are enforced in PostgreSQL. Indexes accelerate lookups; they do not prevent
overlapping reservations or enforce daily workload/rest rules (scheduling layer).

## Compatibility boundary

- Existing lessons remain authoritative for the current API. Legacy bookings carry
  `legacyLessonBinding=true`; standalone bookings must have horse, trainer, arena,
  service type and a positive interval. Nullable legacy horse/arena/service fields
  preserve existing records. Legacy service names are not guessed into disciplines.
- Trainer.phone is unique but nullable to retain old records without contacts.
  Blank phones become NULL; duplicate nonblank phones abort the atomic migration.
- Membership.clientId remains nullable only for records explicitly marked
  `legacyUnassigned`. Unknown owners and their MembershipOp history are retained.
- Migration initially populates new resource fields from legacy fields. Existing workload/rest
  limits and arena capacities are preserved; new horses default to 120/45 minutes.
  Horse owners/stall numbers are initially inferred from current boarding contracts;
  review these inferred owners and the default indoor arena classification.
- In Phases 1.1–1.3 legacy counters and MembershipOp remained authoritative and
  LedgerTransaction was a historical projection. Phase 2 below introduces a live
  transactional bridge: fixed lesson counters and validity aliases stay synchronized,
  while LedgerTransaction becomes the combined journal for known clients. Deposits
  use decimal units only. Resource configuration aliases are synchronized by
  catalog APIs as of Block 1.2; copied legacy Booking dates/statuses remain snapshots.
- Membership status is a stored snapshot; expiration still requires checking dates.
  Journal foreign keys protect linked history; this is not an append-only audit policy.

## Migration and verification

The migration runs inside BEGIN/COMMIT. Production requires a database backup and
preflight checks for duplicate trainer phones, invalid legacy intervals, negative
units, nonpositive workload/capacity and negative rest settings.

`prisma migrate dev --name init_resource_triad_and_boarding --create-only` was
attempted but Prisma refused the noninteractive environment. SQL was generated with
`prisma migrate diff`, reviewed and extended with explicit backfills/checks. It was
applied using `prisma migrate deploy` on both empty and populated isolated databases.

Integration verification uses a disposable local PostgreSQL database, never production:

```powershell
$env:TRIAD_DATABASE_URL='postgresql://horseos@127.0.0.1:55432/postgres'
$env:TRIAD_TEST_DATABASE='horse_os_triad_check_populated_20261008'
node scripts/verify-resource-triad.cjs prepare-legacy
node scripts/verify-resource-triad.cjs deploy
node scripts/verify-resource-triad.cjs test
```

The fixture checks preservation of legacy records, optional resources and orphan
memberships, signed ledger projection, decimals, unique contacts, required triad,
foreign keys, physiological constraints and partial status indexes. Ordinary unit
tests skip these database tests unless RUN_TRIAD_TESTS=1 is explicitly set.

## Block 1.2: booking rules

`POST /api/bookings` (ADMIN/MANAGER) accepts clientId, trainerId, horseId, arenaId,
startTime/endTime (ISO timestamps with timezone), serviceType, optional membershipId,
and costAmount (nonnegative number with at most two decimal places). It creates a
standalone scheduled Booking. It does not debit membership units, charge payments
or send notifications; those financial/delivery workflows are a separate layer.
A supplied membership must belong to the client; this is not a balance reservation.

BookingRulesService runs inside the caller's interactive Serializable transaction.
It locks Arena, sorted Horses, Trainer, sorted Clients using parameterized FOR UPDATE
queries. A supplied Membership is locked afterward. Serialization/deadlock failures
retry the entire createBooking transaction up to five times; exhausted retries return
BOOKING_CONTENTION. Legacy lesson creation/rescheduling uses the same rules and lock
order, retaining its additional service capacity and working-hours checks.

Rules enforce active resources, optional rider weight, daily horse workload, rest,
trainer exclusivity and peak simultaneous arena occupancy. Club days use
CLUB_TIME_ZONE (default Europe/Moscow), including DST and intervals crossing midnight.
Workload is clipped to each local day, with fractional minutes counted accurately.
Intervals are half-open: exactly the required rest and adjacent trainer bookings pass.
The engine counts scheduled/completed standalone bookings and SCHEDULED/COMPLETED
legacy lessons. Cancelled/no-show records do not consume resources. Legacy dates and
statuses are read from Lesson, not the historical copied Booking fields; group horses
are counted once per lesson and all group riders count toward arena capacity.

Client.weightKg is nullable Decimal(5,2), validated both in DTO and PostgreSQL.
Existing resource APIs now synchronize workload/rest/status and arena capacity/
availability aliases on writes; contradictory aliases return 400. Current frontend
forms can keep using their legacy field names. Existing data is not rewritten.

Rule failures return HTTP 409 with `{statusCode,error,code,message,details}`. Codes:
HORSE_UNAVAILABLE, RIDER_WEIGHT_EXCEEDED, HORSE_OVERLOADED, HORSE_REST_VIOLATION,
TRAINER_BUSY, ARENA_FULL, TRAINER_UNAVAILABLE, ARENA_UNAVAILABLE, RESOURCE_NOT_FOUND,
MEMBERSHIP_INVALID, BOOKING_CONTENTION. Malformed DTOs/intervals return HTTP 400.

PostgreSQL tests also cover concurrent horse/trainer/arena/daily-budget contenders,
mixed legacy/new writers, rollback on failed rescheduling, current legacy dates,
cancelled history, HTTP permissions and structured errors. Run the same isolated
database verification commands above; the runner executes both integration files.
Direct SQL writes and future booking status/update endpoints must also honor these
locks and rules; this service is not a database exclusion constraint.

## Block 1.3: schedule read models and editing

- `GET /api/bookings?from=...&to=...` returns paginated standalone bookings with minimal client, horse, trainer and arena relations and Refine total headers. Optional `trainerId`, `horseId`, `arenaId` filters apply. Legacy lessons remain on their existing endpoint, preventing duplicate display.
- `GET /api/bookings/availability?from=...&to=...` returns `date`, `horseWorkloads` and `arenaOccupancy`. The former counts clipped minutes on the club day containing `from`; the latter counts peak simultaneous riders within the requested interval. Both include current scheduled/completed legacy lessons and standalone bookings, under a RepeatableRead snapshot. Optional `excludeBookingId` / `excludeLessonId` support edit previews.
- Both read endpoints allow ADMIN/MANAGER/TRAINER and require zoned ISO timestamps, a positive interval and a maximum range of 62 days.
- `PATCH /api/bookings/:id` allows ADMIN/MANAGER and accepts the complete create DTO. Only scheduled standalone bookings can be edited (`BOOKING_NOT_EDITABLE` otherwise). The Serializable rules transaction excludes the current booking, retains resource locking/retries and rolls back the entire update on conflict. Membership ownership is still checked; no automatic debit is introduced.
- The frontend combines both read sources, uses club-local dates, refreshes all views on save and maps typed conflicts to the relevant form field. Availability is advisory; POST/PATCH always rerun authoritative rules.
- PostgreSQL integration tests cover the new read/availability contracts, exclusion, update rollback and HTTP permissions alongside concurrent creation and legacy interoperability.

## Phase 2: lifecycle and canonical ledger

`PATCH /api/bookings/:id/complete`, `PATCH /api/bookings/:id/no-show`, and
`PATCH /api/bookings/:id/cancel` require ADMIN/MANAGER. Cancellation accepts
`{cancelledBy: "client" | "club", reason: string}` (trimmed, 1–1000 characters).
The lifecycle applies to standalone triad bookings. Legacy group Lesson records
retain their existing attendance/cancellation API and policy; they are not silently
converted to independent bookings. Their ongoing MembershipOp operations are
projected once into the canonical journal by database trigger.

Only scheduled standalone records transition. Repeating the same terminal action
returns the stored record without another charge or extension; a different terminal
action returns BOOKING_STATE_CONFLICT. There is no implicit terminal-state refund or
reopening. These endpoints are explicit administrator actions, not an automatic timer.

- Completion records `completed` + `usage`; no-show records `no_show` +
  `penalty_cancellation` with a no-show description.
- Client cancellation at least exactly twelve hours before start is free
  (`cancelled_client`). Less than twelve hours, including past start, produces
  `penalty_cancellation` and the description «Штрафная отмена менее чем за 12 часов».
- Club cancellation is free (`cancelled_club`), extending only the already attached
  membership by seven club-calendar days, once. It does not select an unrelated
  membership for compensation.
- Fixed lesson plans debit **one unit**, recording signed amount **−1**. Deposits
  debit `Booking.costAmount`, recording its exact negative decimal monetary amount.
  Boarding memberships cannot pay for training. Frozen, expired, not-yet-valid or
  discipline-incompatible memberships are rejected. Empty disciplines mean unrestricted.
- An attached membership must be usable and sufficiently funded; it is never
  silently replaced. Without one, choose a usable funded membership by earliest
  `validTo`, then `createdAt`, then UUID, and attach it upon successful billing.
  No suitable membership returns MEMBERSHIP_REQUIRED; unusable/insufficient ones
  return MEMBERSHIP_UNAVAILABLE / MEMBERSHIP_INSUFFICIENT. No status or balance is
  changed on these failures. Existing PAID cash payments block membership billing;
  pending booking invoices are cancelled in the same successful billing transaction.

Every transition uses an interactive Serializable transaction with five full retries.
Locks follow Arena → Horse → Trainer → Client → membership advisory/row → Booking.
Membership advisory keys match the legacy ledger. PostgreSQL `clock_timestamp()`
after lock acquisition determines the cancellation window and current validity.
Status, optional membership assignment, balance and signed journal commit together.
The partial unique `LedgerTransaction_booking_charge_key` permits only one native
usage/penalty outcome per booking, including across different outcome types.

Migration `20261009010000_booking_lifecycle_ledger` reconciles fixed balances from
the still-authoritative legacy counters at the cutover, fills missing known-client
operation projections, and installs database triggers. Subsequent fixed-unit/date
updates from either API synchronize both representations; conflicting aliases and
fractional fixed lesson units are rejected. Deposits retain decimal precision.
Original MembershipOp history is unchanged, with unique source IDs preventing a
second projection. Back up PostgreSQL before applying this migration. Preserve these
SQL triggers and partial indexes in future migrations; Prisma's schema alone does
not describe them.

`GET /api/clients/:id/membership-ledger` now reads LedgerTransaction (same roles,
paging and legacy type/positive-magnitude fields). Additive `transactionType`,
`signedAmount`, and `unit` distinguish monetary deposits from lesson units. The
client history shows both legacy projections and new standalone training operations.
The schedule confirms paid outcomes, explains the twelve-hour rule and seven-day
compensation, preserves drafts on errors and refreshes bookings, workload and balances.

Verification: `booking-lifecycle.test.cjs`, `booking-lifecycle.postgres.test.cjs`,
the isolated triad runner and frontend triad/client-ledger browser suites cover the
boundary, decimals, idempotency, rollback, concurrent last-unit contenders, legacy
interoperability, access control and narrow screens.
