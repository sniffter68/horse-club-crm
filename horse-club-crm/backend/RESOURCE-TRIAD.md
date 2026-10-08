# Horse Club OS: Block 1.1

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
- New resource fields are populated from legacy fields once. Existing workload/rest
  limits and arena capacities are preserved; new horses default to 120/45 minutes.
  Horse owners/stall numbers are initially inferred from current boarding contracts;
  review these inferred owners and the default indoor arena classification.
- Legacy counters (`remainedLessons`, `totalLessons`, `validUntil`) and MembershipOp
  remain authoritative for existing financial services. LedgerTransaction receives
  a historical projection for operations with known clients, with a unique source
  operation FK. No ongoing dual writes, financial triggers or new billing policy
  are introduced. Decimal balances and duplicated resource fields are foundation
  fields, not a synchronized replacement for current API fields. Moving services
  to the new representation is a subsequent implementation block.
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
