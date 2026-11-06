# Leader feedback — VNPay Back/return reconciliation — 2026-11-06

Branch: fix/leader-vnpay-return. Isolated worktree: payment under TEMP/scms-leader-20261106. Base origin/main 80d7c8e7 fetched on 2026-11-06; original checkout main90924c44 left unchanged. Direct leader assignment is authorized scope under .agents/rules/mandatory-rules.md section2 (explicit assignment); no invented Jira, no AGENTS.md edits. Related existing backlog SCRUM-71/80/86; no new ticket created.

## Root cause and existing business flow

1. MemberPackagesPage subscribes to focus/visibility/online/realtime but not persisted pageshow. Browser Back can restore a stale snapshot from bfcache without remounting. Checkout validates only at initial mount and its cached prepared subscription id was reused without reading current server state.
2. UI disabled cancellation for every payment except failed. Backend MembershipSubscriptionService.cancelPending already allows pending online_wallet after VnpayPaymentGuard confirms no live attempt. UI prevented reaching that existing approved rule. Online attempts were also labelled as cashier transfer review.
3. VnpayPayButton already resets local busy state on persisted pageshow; that reset is not proof of failure and must not settle, cancel or recreate an order.

Existing APIs retained: GET /packages, /memberships/subscriptions/my, /memberships/subscriptions/history, /payments/my, /memberships/cancellations/my; POST /memberships/subscriptions/{id}/cancel; POST /payments/vnpay/checkout; GET /payments/vnpay/transactions/{reference}; POST /payments/vnpay/verify-return; GET /payments/vnpay/ipn. Browser return verifies signed parameters server-side; unsigned return codes do not override backend state. JWT/Member ownership unchanged.

Backend policy inspected, not modified: member/target locks serialize checkout, cancellation and IPN. Signed success settles once; replay cannot reactivate or issue invoice twice. A live pending transaction blocks cancellation; gateway expiry plus existing 15-minute settlement grace must pass before closing an abandoned attempt. Stale attempts can be failed while payment remains pending, so safe cancellation/retry goes through the backend. Delayed success is only honoured while order/payment still pending; after cancellation it cannot settle. Failure does not implicitly cancel a membership.

## Changes

- Persisted pageshow re-reads authoritative package/current/history/payment/cancellation snapshots. Invalidates pre-return background reads and blocks stale purchase/cancel actions until resync finishes; failure keeps actions blocked with existing sync notice/retry.
- Checkout revalidates preserved prepared request on pageshow and before payment; active/cancelled/wrong-package targets cannot submit another wallet/checkout operation. Out-of-order reads ignored.
- Pending online cancellation reaches existing backend guard; live attempts can still return409 and remain pending for retry. Cash pending, success, refunded and unknown payment states remain protected. No automatic cancellation on Back; retry reuses server-controlled checkout.
- Pending/failure notices explain uncertainty/retry. No Finance policy, API contract, backend source, dependency, schema or shared database changes.

Files: MemberPackagesPage.tsx/test, MemberCheckoutPage.tsx/test, VnpayPayButton.tsx(comment only), VnpayReturnPage.test.tsx, DESIGN.md, local plan and this report.

## Verification

- Baseline targeted frontend: 69/69 PASS.
- Four initial regressions observed RED before implementation.
- Final targeted frontend: 76/76 PASS with one worker, including invalidation of a pre-Back background snapshot while the newer return read is pending.
- Existing frontend tests cover payment response success/failure and signed-return authority; added pending→late success recheck, persisted Back, pending cancellation guard conflict/retry and prepared-target late settlement.
- Initial broad verification paused: concurrent Node runs exhausted host memory; Java reached production compile but test compilation failed with native allocation/pagefile error. Not a dependency or business-logic failure; rerun with bounded heap/one worker pending.
- Browser UI: NOT RUN. CUA reports native pipe missing and browser access host unavailable. No actual Back click/console/desktop-mobile/light-dark verification claimed.
- Sandbox payment/DB E2E: NOT RUN. No authorized sandbox Member session/gateway test execution provided; no payments, cancellations, writes or schema changes made against Supabase.

## Manual follow-up on authorized isolated sandbox only

1. Sign in as a permitted test Member, choose a pending package and launch VNPay sandbox; press browser Back. Verify a fresh authenticated read, pending remains pending and no extra POST/settlement occurs automatically.
2. For a live attempt, cancellation must report awaiting-confirmation and retain pending. After existing server expiry+grace, cancellation may succeed; retry must reuse backend-controlled request/reference policy. Do not shorten timers or edit shared data for QA.
3. Repeat Back/Forward/refresh; verify late signed success produces active/paid state, hides cancellation and cannot debit/activate twice. Inspect requests without copying tokens or secrets.
4. Test failed/cancelled gateway response and late IPN/cancellation race in mock or isolated sandbox; receipt review/success/refund stays protected. No production/shared payment test.

Review integration: language branch also translates these source files; apply functional and translation changes together with conflict review. Four independent branches are not merged. Commit/push/PR: none. Browser/sandbox E2E remains a pre-merge acceptance gap even when unit checks pass.
Static runner/database configuration checks: 10/10 PASS (no connections or writes). High-signal secret scan on changed files: 0 matches. Full suite/lint/build/backend capped-memory rerun still pending.

## Final backend and targeted frontend evidence

Backend production/test compilation and selected mock/WebMvc/policy suites passed with bounded heap and processor count: 115 tests, failures0/errors0/skipped0, BUILD SUCCESS, exit0. Includes VnpayPaymentService/Guard/IpnHandler/Security, MembershipSubscriptionService/Controller and DatabasePolicy/Profiles. No dependency/config source changes needed; original allocation/pagefile crash was resolved by sequential resource limits. Static runner config10/10 passed.

Final targeted frontend77/77 PASS. Additional RED→GREEN regression covers failed return synchronization recovered by pending status refresh; that control uses a full authoritative refresh when syncError/returnSyncing, preserving existing manual refresh race behavior otherwise. Final parent lint/build exit0; full frontend rerun result follows. New pending/return text uses existing t(vi,en), preserving selected language during the flow. Payment branch does not claim to complete translations of every other membership label; language branch owns those edits.

## Final parent result

Full frontend:848/848 PASS, failed0, exit0, one worker. ESLint PASS exit0; TypeScript/production build PASS exit0. Backend115/115 PASS and runner config10/10 PASS as above. Diff check and high-signal secret scan PASS. These final checks supersede earlier pending/resource-failure notes.

Browser UI/console/light-dark/Back/Forward and VNPay sandbox/shared DB E2E remain NOT RUN, not a payment acceptance claim. Code is ready for independent review/draft preparation after authorized commit, but real gateway acceptance plus i18n integration conflict review remains before merge. Live pending VNPay cannot be cancelled immediately just because the user pressed Back; existing Finance guard and grace remain authoritative. Any requested policy change to immediate void/refund requires Finance owner review.

## Authorized publication review

The user explicitly requested commit and non-force push of this existing branch, with a Draft PR creation link into main. This is a direct leader assignment; no fabricated Jira ticket is added. Worktree and branch scope are preserved; no new workspace, backend source, Finance policy, schema or shared database changes.

Browser retry: NOT RUN. Computer Use returned no browsers/apps, native pipe unavailable and browser access host unavailable. Desktop/mobile/tablet, light/dark, browser console and actual session behavior require manual verification before merge. Mock tests are not reported as browser verification.

Fetched origin/main is c814e7c0, five commits beyond this branch base 80d7c8e7. Main integration is not silently rebased/merged; review current main configuration and rerun integrated checks before merge. The graphify executable is unavailable locally; graph refresh is NOT RUN and generated artifacts are not added.
Language/VNPay integration dependency: both branches change DESIGN.md; MemberCheckoutPage.tsx/test; MemberPackagesPage.tsx/test; VnpayPayButton.tsx; VnpayReturnPage.test.tsx. Do not resolve by choosing an entire branch version. Preserve render-time translations/source-message metadata and API error handling from Language AND pageshow/request-version invalidation, backend-authoritative cancellation guards, pre-payment history validation and all regression tests from VNPay. Prefer reviewing/landing VNPay functional changes first, then manually integrate Language over the updated base and rerun combined membership/payment/language tests. Draft status does not imply sandbox acceptance.
Three-way overlap check (base 80d7c8e7; LF-normalized scratch copies; no merge applied): conflicts in DESIGN.md (1 region), MemberCheckoutPage.test.tsx (1), MemberCheckoutPage.tsx (3), MemberPackagesPage.test.tsx (1), MemberPackagesPage.tsx (5). VnpayPayButton.tsx and VnpayReturnPage.test.tsx merge textually without conflict but still require combined semantic regression testing. These branches are separately reviewable Drafts; do not merge both unchanged or resolve conflicts by selecting an entire file. A follow-up integration on the existing Language branch after VNPay review is required before both can merge.
Publication verification rerun: targeted VNPay frontend 77/77 PASS; full frontend 848/848 PASS; ESLint PASS; TypeScript/production build PASS. Sequential execution, Vitest maxWorkers=1, Node heap capped at 1536MB. Offline Maven mock/WebMvc/policy regression tests 115/115 PASS, failures/errors/skips zero, BUILD SUCCESS (Maven heap384MB; fork256MB; metaspace192MB; processors2). Static runner configuration 10/10 PASS. No backend/DB/gateway connection or transaction exercised. Browser and sandbox E2E NOT RUN. Ready for Draft code review only; Finance owner must review pending guard/grace behavior and authorized isolated sandbox must validate Back/callback/cancellation before merge. All Language integration conflict notes above remain applicable.
