# SCRUM-74 — Legacy booking transaction protocol

Applies on top of SCRUM-73. Enrollment remains class-based; quota, membership dates,
Vietnam session eligibility, permissions and the 24-hour offer window are unchanged.

## Locks and state

Use PostgreSQL `PESSIMISTIC_WRITE`, not a JVM mutex. Assume PostgreSQL READ COMMITTED.
Transaction boundaries are on the public service methods; locks last until commit/rollback.

| Writer | Lock order / fresh reads |
| --- | --- |
| Enroll/claim, join | Member → class → read booking/offer state; membership eligibility checked under member lock |
| Cancel enrollment | Scalar class-ID discovery → class → enrollment row; check status/ownership after locking |
| Withdraw | Member → scalar class-ID discovery → class → waitlist row |
| Membership hold/cancellation cleanup | Caller holds member (and may hold its subscription); discover class IDs without entities, lock all classes ascending, then read/update rows |
| Promotion/expiry | Class → read current rows/counts → flush transition before notification |
| Scheduler | Keyset-paged class IDs only; external call to EnrollmentService commits one class per transaction; no encompassing scheduler transaction |

Only promote a FIFO waiting entry if booked + live offers is below class capacity.
Tie-break identical requestedAt by ID. Both notification entry and offer state are in
the same transaction; external notification dispatch and promotion events occur after commit.
Duplicate cancellation retains the existing 400 SCHEDULING_ENROLLMENT_NOT_BOOKED response.

An offer is expired at deadline <= now, or at notifiedAt + 24h <= now. Legacy records
with only one timestamp use that bound; a notified record with neither timestamp
cannot grant a reserved seat and is eligible for cleanup. Live-count, cleanup and
claim predicates follow the same bounds. No automatic POST retries are added.

Legacy statuses are waiting/notified/expired. A claim or withdrawal also ends in
expired. A live notified entry cannot rejoin; after expiry it can rejoin at the end
when the class is full. No historical status or row is rewritten by a migration.

## Explicit claim identity

Claim clients pass optional query parameter waitlistId on the existing enroll endpoint.
After the class lock, a scoped row lock requires that ID to belong to the current member
and requested class (otherwise 404); only a live notified offer may proceed. A terminal
offer returns 409 SCHEDULING_WAITLIST_OFFER_NOT_ACTIVE, an overdue notified offer returns
SCHEDULING_WAITLIST_OFFER_EXPIRED. Explicit claims never fall back to fresh booking.
Requests without the parameter retain legacy ordinary-enrollment behavior. The Member
notified-confirm action always sends the ID; it does not retry failed claims as ordinary POSTs.

## Known dependencies — do not claim global concurrency protection

- Finance PaymentService.processPayment and activateLinkedTargetsOnSuccess write booked
  directly. Refund writes cancelled before invoking promotion. The capacity trigger takes
  the class lock during an UPDATE, so an enrollment-row → class inversion remains possible
  against class → enrollment cancellation. Finance/Core owner must move these writes to
  the same protocol before claiming global deadlock/hold protection. This PR does not edit Finance.
- ClassSessionService cancellation still cancels only the session, never all class enrollments.
  Atomic booking versus session editing/cancellation requires its own shared lock/refresh review.
- Partial unique index uq_waitlist_active covers waiting only. Service checks cover notified
  for participating writers. Pre-existing duplicate notified rows and direct SQL writers require
  DB owner inspection; this PR adds no index/trigger/schema change or data cleanup.

## Verification and rollout

Unit/mock ordering and state tests cannot prove PostgreSQL row locking. The existing
OperationsConcurrencyPostgreSqlTest isolated-schema harness now includes twelve booking cases:
duplicate cancellation, cancellation/promotion, withdraw/promotion, duplicate expiry workers,
expired claim/expiry, live claim/expiry, last-seat competition, notified rejoin/expired membership,
membership hold/enroll, rollback, late explicit claim versus fresh booking, and claim ownership/class scope.
Workers have independent transactions/connections,
bounded statement/future timeouts and pg_stat_activity lock barriers.

These PostgreSQL cases are NOT RUN in this change. Enable only on an explicitly authorized
Supabase dev/test project with SCMS_POSTGRES_TEST_* credentials and an isolated schema.
The harness creates/drops its random operations_test_* schema and starts Hibernate/seeders
there; never point it at the shared project. Do not run the application or SQL for this review.

Before deployment: Core/Operations review lock order and READ COMMITTED assumptions;
Finance owner review the bypasses; DB owner run real concurrency/rollback tests and inspect
legacy duplicate/malformed offers. Deploying this PR needs no schema update. Rollback the
application if needed; retain all existing waitlist/enrollment/history rows and the SCRUM-73 fix.
