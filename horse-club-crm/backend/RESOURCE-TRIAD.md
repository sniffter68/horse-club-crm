# Horse Club OS: Blocks 1.1–1.2

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
- Legacy counters (`remainedLessons`, `totalLessons`, `validUntil`) and MembershipOp
  remain authoritative for existing financial services. LedgerTransaction receives
  a historical projection for operations with known clients, with a unique source
  operation FK. No ongoing financial dual writes, triggers or new billing policy
  are introduced. Decimal balances remain foundation fields; financial services
  still use legacy counters. Resource configuration aliases are synchronized by
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
