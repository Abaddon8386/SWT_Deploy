# Staff account provisioning implementation plan

**Goal:** Manager/Admin create Coach and Receptionist accounts; only Admin creates Manager; Google sign-in preserves provisioned staff roles.

**Architecture:** Reuse existing UserService and account form styles. Keep CENTER_MANAGER as the persisted Manager code and STAFF as the existing frontend Receptionist session alias. Add ADMIN without migrating existing users. Separate staff provisioning from unrestricted account administration at both API and route level.

**Tech stack:** Java 21 / Spring Boot / JPA, React / TypeScript. No new dependencies or DDL.

**Spec:** User instruction on 02/11/2026 supersedes the earlier proposal: Manager may provision staff accounts, while general user/role administration remains Admin-only.

**Tickets:** Existing SCRUM-50 (user CRUD), SCRUM-52 (RBAC), SCRUM-61/63 (integration); IAM owner Tài. This is the user's explicitly requested extension, not a claim that Jira tickets have been updated.

## Scope and security

- Public/password/Google registration creates only Member. An existing account's verified Google identity uses its stored role.
- Coach and Receptionist are provisioned through authenticated Manager/Admin flows. The dedicated DTO accepts only these two roles.
- General users/roles endpoints become Admin-only, preventing Manager from creating Manager or changing a user's role through an update request.
- Manager accounts retain their existing identity/role. Do not infer ADMIN from username admin.
- Bootstrap Admin is opt-in via email/password environment variables, no default credentials; use JPA and idempotent seeding.
- Keep five domain roles: MEMBER, COACH, RECEPTIONIST, CENTER_MANAGER, ADMIN.
- Keep current portal layout/theme; add role-specific links and states.
- Third-party email linking retains existing Google identity verification requirements.

## Tasks

- [x] Write regression tests: Google callback/direct preserve staff role, locked/deleted denied, new users stay Member; staff provisioning rejects non-staff roles and creates subtype profiles; real security filters reject Manager on users/roles and allow staff provisioning. Shared Google OTP policy allows active provisioned staff; inactive staff cannot activate themselves.
- [x] Run tests before implementation and confirm expected failures in Admin sessions, role security, staff profiles and Google staff login.
- [x] Add staff DTO/controller and scoped service creation/listing; create Coach/Receptionist profile via existing cascading User mappings. Change administrative security matchers and annotations to ADMIN.
- [x] Seed ADMIN and optional bootstrap Admin; retain existing Manager accounts but remove Manager bootstrap creation so new Managers are created only through Admin. Protect both administrative roles from inactivity cleanup. Remove IAM grants from Manager during the role split without resetting other custom grants.
- [x] Allow Google for MEMBER/COACH/RECEPTIONIST and preserve DB role in responses/JWT; retain manager/admin restrictions and all identity/status checks.
- [x] Add ADMIN session/portal/home support. Keep UserManagerPage for Admin. Add a focused Manager staff list/create page, limited to Coach/Receptionist. Public forms never offer privileged roles.
- [x] Update OpenAPI, setup guide, master guide and DESIGN.md. Record exact verification and limitations.
- [x] Run backend suite and database policy script; frontend tests/build/lint. Independent review findings addressed: correct Admin profile label and protect the last active Admin from lock/delete/demotion. Supabase/browser/Google-provider E2E remains unverified; see QA report.

## Review focus

1. Raw HTTP requests cannot bypass the UI role dropdown or use Manager to create another Manager.
2. Email normalization does not create a second Member instead of using an existing staff account.
3. The new account has its Coach/Receptionist subtype profile and can use professional APIs.
4. Existing username admin with CENTER_MANAGER remains Manager; bootstrap does not silently promote it.
5. Admin session redirects and mobile navigation exist; Manager cannot follow the old user-management URL into Admin features.
