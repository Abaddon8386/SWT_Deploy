# Court booking implementation

Spec: [handoff](2026-11-02-court-booking-handoff.md). User approved all eight proposed defaults and both phases on 2026-11-02. No staff booking on behalf of members. No Jira key exists for this feature; do not invent one.

Architecture: JPA code-first courts feature, transactional services, PostgreSQL invariant triggers installed after Hibernate, React feature using existing portal tokens and controls. Existing rooms retain nullable new fields and are not automatically turned into courts. No migration DDL or additional dependencies.

## Shared contract

- Room request adds nullable `disciplineId`, `openTime`, `closeTime`; room response adds these and `disciplineName`. Bookable disciplines: Tennis, Cầu lông, Bơi lội. Opening hours required when assigning a court; whole hours, open < close, no overnight hours. Existing non-court rooms remain valid.
- `GET /api/v1/courts?discipline=` → array `{id,name,location,disciplineId,disciplineName,openTime,closeTime}` of available courts.
- `GET /api/v1/courts/{id}/availability?date=` → array `{startTime,endTime,status}`; status `free|booked|class|past`.
- `POST /api/v1/court-bookings` body `{roomId,date,startTime}` → booking DTO.
- `GET /api/v1/court-bookings/my?page=0&size=20` → Spring page of booking DTOs.
- `GET /api/v1/court-bookings?date=&roomId=&page=0&size=20` → Spring page, staff/manager only; date required.
- `PATCH /api/v1/court-bookings/{id}/cancel` body optional `{reason}` → booking DTO. Owner only for members; staff/manager can cancel future bookings without the two-hour limit. Repeated cancellation is idempotent after ownership authorization.
- Booking DTO `{id,roomId,roomName,disciplineName,memberId,memberName,date,startTime,endTime,status,createdAt,cancelledAt,cancelReason,canCancel}`. Member identity is never exposed through availability. `canCancel` computed server-side for actor.
- All responses use existing `ApiResponse<T>`. All court routes explicit role guards. Backend staff roles `RECEPTIONIST` and legacy `STAFF`; frontend `STAFF`, `MANAGER`.
- Rules: future start, today through today+7 inclusive in Asia/Ho_Chi_Minh; 60 minutes on whole hour within room hours; max two booked rows/member/date; no overlapping bookings by room or member; active membership today and same period covers booking date. Cancellation at exactly two hours allowed.
- Error codes from handoff plus `COURT_BOOKING_INVALID_SLOT`, `COURT_BOOKING_FORBIDDEN`, `COURT_BOOKING_INVALID_COURT`. Message keys `error.courts.<lowercase suffix>` and success `success.courts.*` in all three bundles.

## Execution and verification

- [x] Backend: service tests first for success, validation boundaries, subscription coverage, conflicts, limits, ownership and cancellation. Implement entity/repositories/DTOs/service/controller/security and OpenAPI. Extend room API/configuration compatibly. Verify focused Maven tests.
- [x] Frontend: API client and UI tests first. Implement member grid and own bookings, staff daily list/cancellation, manager room assignment/hours, routes/menu, public sport CTA. Keep mobile primary nav unchanged. Verify TypeScript/lint/Vitest.
- [x] Database integration: add locked room/member daily invariant checks; extend session trigger and class reassignment checks in both directions. Translate named constraints. Add concurrency/regression and schema-upgrade tests using isolated Supabase test schema when configured; never use production data.
- [x] Review integration boundaries: DTO types, legacy catalog constructors/tests, zero-second time validation, shared lock ordering, class room reassignment, missing/unsupported room configuration, stale grid response races, pagination, cancellation refresh and role policies.
- [x] Run full backend/frontend checks, database policy PowerShell script; inspect diff; update DESIGN.md and handoff with actual evidence and any skipped real-DB verification. Preserve unrelated changes; do not commit/push without explicit request.

## Verification evidence (2026-11-02)

- Backend `./mvnw.cmd -q -o test`: 896 tests, 0 failures, 0 errors, 42 skipped. One controller test (`CourtBookingControllerTest.ownAndDailyListsExposePageContent`) failed because it built `new PageImpl<>(List.of())`, whose unpaged pageable Jackson cannot serialize; the test now uses `PageRequest.of(0, 20)`. Production code returns real paged results and was unchanged.
- Frontend: `npx tsc -b` and `npx eslint src --max-warnings=0` clean; `npx vitest run` 85 files, 556 tests passed.
- `scripts/test-database-config.ps1`: 10 cases passed.
- **Not verified against a real database:** `CourtBookingPostgreSqlTest` (8 tests: trigger conflicts both directions, membership coverage, member overlap, concurrency, schema upgrade) is gated by `SCMS_POSTGRES_TEST_URL` and was skipped. Before merging, run it once against the isolated Supabase dev/test schema.
- Not committed or pushed. Unrelated working-tree changes (including `graphify-out/`) left untouched.
