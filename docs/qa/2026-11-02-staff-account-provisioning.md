# Staff provisioning and Google role verification — 02/11/2026

Related existing backlog: SCRUM-50 / SCRUM-52 / SCRUM-61 / SCRUM-63. Implementation follows the user's extended requirements; no Jira issue was created or updated.

## Result

- Manager (`CENTER_MANAGER`) can list and create Coach/Receptionist through `/staff-accounts` and `/manager/users`.
- Admin has account/role administration at `/users`, `/roles` and `/admin/users`, including Manager creation. Manager cannot reach these APIs, including by a direct role-change request.
- Staff provisioning validates role at the DTO and service boundaries and creates the matching professional profile using JPA cascading.
- Public registration and new Google identities remain Member-only. Existing active Coach/Receptionist Google sign-in retains their database role in both response and JWT; email is normalized and existing Google identity binding protections remain.
- Admin bootstrap uses `APP_BOOTSTRAP_ADMIN_EMAIL` / `APP_BOOTSTRAP_ADMIN_PASSWORD`. Existing Manager users are not promoted. Manager bootstrap creation has been removed; use Admin to create new Managers.
- Last active Admin cannot be locked, deleted or demoted. Removals lock the shared role row before counting active Admins.

## Checks run

| Check | Result |
| --- | --- |
| Full Maven test suite | 834 total: 800 passed, 34 skipped, zero failures/errors; exit 0 |
| Frontend Vitest suite | 78 files, 509 tests passed; two workers to stay within available memory |
| Staff form tests after final PageHeader reuse | 2 passed |
| Frontend build | Passed (TypeScript and Vite) |
| Frontend lint | Passed |
| `scripts/test-database-config.ps1` | 10 cases passed |
| Independent code review | No blocking findings after the last-Admin guard and profile label fixes |

The first tests reproduced the missing behavior before implementation: staff Google logins were forbidden, Manager could access general user administration, staff profiles were absent and Admin sessions were unsupported. A later old method-security test was updated because Manager deleting users is no longer allowed.

Full-suite attempts initially hit native-memory limits. The successful backend run used process-local `JAVA_TOOL_OPTIONS=-Xms32m -Xmx512m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:ActiveProcessorCount=2`; no repository JVM configuration was changed. The frontend suite used `npm.cmd test -- --maxWorkers=2`.

## Limits

The 34 skipped tests are Supabase integration tests: CenterCheckinSchemaUpgradePostgreSqlTest (1), ChatPostgreSqlTest (2), OperationsConcurrencyPostgreSqlTest (16), PostgreSqlDatabaseIntegrationTest (15). This session did not provision or mutate a live Supabase database, run a real Google OAuth session, or perform browser E2E. The new role-row locking behavior was reviewed and unit-tested but not verified with concurrent PostgreSQL transactions.

Knowledge-graph refresh is code-only. The graph tool reports a missing optional SQL parser and partial AST extraction for existing TypeScript syntax; the graph is a navigation aid, not verification evidence.
