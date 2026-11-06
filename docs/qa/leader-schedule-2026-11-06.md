# Leader My Schedule verification — 2026-11-06

Scope: MemberClassesPage default My schedule tab (internal tab key: timetable; the schedule key is the class catalog tab) (/member/classes) composes MemberCalendar. Frontend-only changes on fix/leader-member-week-schedule, based on origin/main 80d7c8e7. No Jira key was provided for this leader request.

## Behavior and data trace

- This week / Tuần này clears mobile selected day, forces week view, and resets the anchor to the center date. Existing centerNowParts uses Asia/Ho_Chi_Minh. mondayOf/addDays produce inclusive Monday–Sunday API bounds and filter displayed class/court events to that range.
- Existing real endpoints remain: /classes/session-bookings/my?from&to, /classes/enrollments/my, and courtsApi.my (/court-bookings/my?page&size). Public class sessions are metadata joined only to the member's actual bookings/enrollments; unbooked catalog sessions do not become personal events. No sample events, database edits or backend changes.
- Court/room events use pale blue (#b8dcff), classes salmon (#f2a38f), with #202020 text on active blocks. Calculated WCAG text contrast is 11.42:1 on court blue and 8.08:1 on class salmon. Explicit type labels are present in week/month/next item/details. Solid type borders and colored labels persist for past/cancelled blocks whose shared status surface remains muted. Member-only CSS leaves other calendars unchanged.
- Only the Member monthly empty message was removed; the 42-day month grid remains. Week empty status, load errors/retry and booking cancellation confirmation/API routes remain. Court-load errors suppress the misleading empty-week message.
- Local VI/EN text uses the existing useLanguage().lang hook; the calendar wrapper is marked data-i18n-managed for the language branch translator exclusion; no changes to shared language mechanics. Server content names/errors retain their server language. Scope is the My schedule calendar plus the surrounding page header/tabs and related static loading/empty/error labels. The class catalog and personal-trainer booking flow still depend on the existing legacy translator; this is not a claim that the entire MemberClassesPage is fully translated.

## Changed files

- apps/web/src/features/member/MemberClassesPage.tsx and MemberClassesPage.test.tsx (related header, tabs, loading/empty/error labels)
- apps/web/src/features/member/components/MemberCalendar.tsx
- apps/web/src/features/member/components/MemberCalendar.css
- apps/web/src/features/member/components/MemberCalendar.test.tsx
- DESIGN.md
- This QA report.

## Automated evidence

- Baseline: targeted calendar suite 6/6 passed before edits.
- Red phase: seven new regressions failed on old behavior (week reset, type labels, monthly empty removal, language updates).
- Final targeted suite: 44/44 passed across MemberCalendar (17) and MemberClassesPage (27), including a new parent header/tab/empty VI/EN regression. Covers UTC+7 Sunday 23:59:59/Monday 00:00, cross-month/year weeks, reset from navigated month, inclusive event filter, unbooked public-session exclusion, mobile type labels, month/detail labels, VI/EN live change, empty/error behavior, booking and enrollment cancellation APIs, court management link, focus refresh.
- Final full suite: npm.cmd test -- --maxWorkers=1 PASS, 127 files / 852 tests passed (125.79s), exit 0, after all source edits. Console includes existing localhost:3000 ECONNREFUSED warnings; no test failures.
- Final lint: npm.cmd run lint PASS, exit 0.
- Final build: npm.cmd run build PASS, exit 0 (tsc -b and Vite, 437 modules transformed, Vite production output built in 1.03s).
- An earlier build caught a test-only mockReset union narrowing issue, corrected before these final checks. Initial final lint/build stopped at parent request to relieve host memory pressure.

## Browser evidence and limits

NOT RUN: CUA getState returned no apps or browsers; native pipe unavailable (os error 2) and browser access host unavailable. No screenshot, real browser responsive/keyboard/visual pass or authenticated live API claim is made. Happy DOM tests cover mobile day selection and semantics, not painted layout.

Manual browser follow-up when host is available: open Member → Lịch học của tôi; navigate month forward then This week; confirm Monday–Sunday dates and week mode. Check court/class labels at desktop/mobile in light/dark, open/close details with keyboard, confirm cancellation dialog but do not submit real cancellations, switch VI/EN, inspect empty/error/retry with isolated test fixtures.

Existing limits retained: court history fetch reads at most five pages; next-up class lookahead is 30 days. No concrete current-week omission was observed because live authenticated QA was unavailable. Existing 14-hour rendered timetable window is unchanged. No Supabase writes, commit, push or PR.

## Authorized publication review

The user explicitly requested commit and non-force push of this existing branch, with a Draft PR creation link into main. This is a direct leader assignment; no fabricated Jira ticket is added. Worktree and branch scope are preserved; no new workspace, backend source, Finance policy, schema or shared database changes.

Browser retry: NOT RUN. Computer Use returned no browsers/apps, native pipe unavailable and browser access host unavailable. Desktop/mobile/tablet, light/dark, browser console and actual session behavior require manual verification before merge. Mock tests are not reported as browser verification.

Fetched origin/main is c814e7c0, five commits beyond this branch base 80d7c8e7. Main integration is not silently rebased/merged; review current main configuration and rerun integrated checks before merge. The graphify executable is unavailable locally; graph refresh is NOT RUN and generated artifacts are not added.
Publication verification rerun: frontend 852/852 PASS, ESLint PASS, TypeScript/production build PASS. Sequential run, one worker, Node heap capped at 1536MB. Current main overlaps DESIGN.md and MemberClassesPage.test.tsx (retired favorites mock cleanup); preserve that cleanup when integrating tests. Browser NOT RUN. Ready for Draft review pending UI/integration acceptance.
