# SCRUM-119 / SCRUM-123 / SCRUM-127 — Evaluation notifications

Implemented directly on main at user request. Feature scope: coach evaluation submission/updates notify the evaluated member; clicking notification opens the progress feedback section. Attendance-only saves do not notify. Notifications and evaluations share the service transaction. External channel dispatch remains after commit.

Added nullable JPA `Notification.actionPath`; Hibernate update adds the column while existing rows retain null and use legacy entity/type routing. No manual DDL or enum/check changes. Notification DTO adds an optional field. Contracts updated in sprint2, sprint3 operations and coaching analytics.

Verification:
- Maven: 972 tests, 0 failures/errors, 34 skipped (Supabase integration credentials not configured).
- Frontend: 672 tests passed; ESLint and production build passed.
- `scripts/verify-evaluation-notifications.cjs`: passed with mocked API at 390/768/1440/1920/2560px, including read mutation, feedback navigation, no console page errors and no horizontal document overflow.
- Real Supabase schema update, cross-account notification delivery and deployment not exercised.
- PowerShell and graphify are unavailable in this environment; database policy/profile tests run through Maven. No manual SQL applied.
