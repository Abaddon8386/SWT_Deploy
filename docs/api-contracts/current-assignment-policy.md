# Current Coach–Member scope

GET /api/v1/coaching/members returns active, non-deleted members and derives the Coach ID from authenticated principal. No roster fan-out, client coach ID or package purchase is authoritative. A member is returned once because the root query selects Member and uses correlated EXISTS.

Current relationship means at least one of: active training plan covering today's Vietnam date; confirmed PT booking today or later; booked legacy class enrollment with an active class and a scheduled session today or later; booked per-session enrollment with an active class and scheduled session today or later. Dates are inclusive for the current center day; cancelled/pending/expired/finished relationships alone do not qualify. This is an authorization gate, not a new PT assignment table. Manager retains existing active-member administrative scope.

The same CurrentCoachMembers foundation is present identically in A and B because both independently enforce this scope. Merge identical shared files once; do not maintain two directory APIs. Existing historical CoachMemberAccess remains unchanged for unrelated modules. New Health and Daily Workout services use the current gate. Training-plan creation/mutations in B also recheck the current gate. No database schema or data migration.

An empty query cannot prove which relationship ended; it simply denies current access. Query parsing is tested offline against real JPA metadata. Actual PostgreSQL predicate execution and browser/JWT E2E require an approved isolated test target and remain NOT RUN.
