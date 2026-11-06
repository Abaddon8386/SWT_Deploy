# Leader language synchronization — 2026-11-06

Branch fix/leader-language-sync, isolated worktree i18n under TEMP/scms-leader-20261106, base origin/main80d7c8e7. Direct leader assignment; no new Jira or AGENTS changes. Original checkout/protected PR branches/prototype unchanged; no commit/push/PR/database operations.

## Root cause

- scms_lang, shared hook and Accept-Language existed, but most related Member UI rendered hardcoded Vietnamese. DOM TreeWalker/MutationObserver translated a small exact-phrase list outside React, missing attributes/dynamic states and allowing React updates to overwrite text.
- Reverse EN→VI mapping rewrote arbitrary English that had never been translated (e.g. literal Active). Source-owned notices, errors and toast text were flattened into strings at creation and could not change language reactively.
- Client-created network/HTTP/PDF/session fallback errors were Vietnamese even when backend Accept-Language was English.

## Safe changes and scope

- Keep a single existing scms_lang preference, same-tab subscription and cross-tab storage synchronization, document lang/data-lang and API request headers. Existing useI18n t(vi,en) remains valid, with finite source-owned dictionary fallback and optional bilingual source payload. Missing dictionary keys fall back safely to original source; inherited names like toString do not count as keys.
- Translate source-owned Packages, Checkout, VNPay button/return, Member Support and notification chrome at React render time, including dynamic modal/button/aria/placeholder/empty/loading/fallback messages. Stable form category values, user drafts, package catalog content, account names and backend message bodies are not translated as UI labels.
- Tag converted pages as managed; legacy DOM adapter skips them. Preserve limited legacy behavior in unmigrated roles/public/catalog/PT screens to avoid deleting existing translations. Remove unsafe English reverse inference. This is a scoped migration, not a claim that every unrelated screen is fully bilingual.
- Shared Modal/ConfirmDialog/RefreshButton defaults translated. Source-owned local notifications and active toast messages carry optional provenance metadata and react to language changes; untagged backend/user/legacy messages remain unchanged. Existing store/preference retained.
- ApiError optionally carries translation metadata only for client-created fallbacks. Server-provided messages remain verbatim; requests still use the selected Accept-Language. No request, authorization, session or payment settlement behavior changed.
- Backend read-only parity check: messages.properties, messages_vi.properties, messages_en.properties each987 distinct keys, zero duplicates/blank values/missing/extra keys. Default equals VI; EN differs on985 values. No backend bundle or API contract change required.

## Files

- shared/i18n/language.ts, translations.ts and three new focused i18n test files.
- shared/api/client.ts, shared/lib/errorMessage.ts, membershipPresentation.ts, portalNotices.ts; shared/ui/Modal.tsx, ConfirmDialog.tsx, RefreshButton.tsx, toast.ts.
- features/member/MemberPackagesPage.tsx/test, MemberCheckoutPage.tsx/test, MemberSupportPage.tsx/test, MemberNotificationsPage.tsx, NotificationsPopover.tsx; features/payments/VnpayPayButton.tsx, VnpayReturnPage.tsx/test; features/portal/PortalShell.tsx.
- DESIGN.md and this report.

## Automated verification

- RED regressions observed for legacy rewriting of English data and unlocalized related UI; implementation tests cover VI→EN→VI while modal/error/draft already exists, attributes, dropdown labels with stable values, source notices/toasts, backend text preservation, unsupported preference and missing-key fallback, API JSON/PDF headers.
- Earlier targeted158-test run exposed four migration issues (bilingual error render, whitespace, toast expectation); corrected and affected13 passed. Earlier lint/build passes preceded final cleanup; final parent verification recorded below.
- Full/lint/TypeScript/build final results pending parent verification. No backend code changes; backend bundle parity inspected read-only.

## Browser/E2E and risk

Browser desktop/mobile/light-dark/navigation/login preference: NOT RUN. CUA has no native/browser host. No real Member credentials/tokens read, no authenticated API/server-content or Supabase E2E claimed. Existing API backend strings and untagged historic notices do not gain invented client translations; they retain their original content. Related new source notices are reactive.

Review integration with payment branch in MemberPackagesPage, MemberCheckoutPage, VnpayPayButton and tests. Preserve payment functional guard/pageshow changes and render-time translation together; no combined branch/PR is created here. Schedule/chat branches contain their own explicit UI translations and managed markers. All source differences independently reviewable; real browser verification remains pre-merge acceptance work.

Automatic review rejected extra protective markers around identity text; no such modification was applied. Read-only inspection verified PortalShell's DOM adapter already scopes to mainRef and excludes header identity content, so no workaround or permission weakening is needed.

## Final parent verification

- Parent reproduced two full-suite failures caused by passing an extra undefined third toast argument to legacy callers. Restored the old two-argument call when no provenance metadata is supplied; no manager/report code changed.
- Final targeted run including related UI, i18n and report compatibility: 105/105 PASS.
- Final full frontend: 848/848 PASS, failed0, exit0 (single worker). Final ESLint exit0; final TypeScript/production build exit0. Diff check PASS; high-signal secret scan0 matches.
- Temporary migration scripts removed. No backend, schema, Finance policy, auth/session protocol or second language preference changes.
- Browser desktop/mobile/light/dark/console and authenticated Member E2E remain NOT RUN, not implied by unit results. Untagged server/historic notification content retains backend-provided language; unrelated legacy screens are explicitly not a completed app-wide migration.
- Suitable for scoped code review / draft PR after authorized commit; actual UI acceptance and integration conflict resolution with payment branch are still required before merge. No commits/push/PR performed.

## Authorized publication review

The user explicitly requested commit and non-force push of this existing branch, with a Draft PR creation link into main. This is a direct leader assignment; no fabricated Jira ticket is added. Worktree and branch scope are preserved; no new workspace, backend source, Finance policy, schema or shared database changes.

Browser retry: NOT RUN. Computer Use returned no browsers/apps, native pipe unavailable and browser access host unavailable. Desktop/mobile/tablet, light/dark, browser console and actual session behavior require manual verification before merge. Mock tests are not reported as browser verification.

Fetched origin/main is c814e7c0, five commits beyond this branch base 80d7c8e7. Main integration is not silently rebased/merged; review current main configuration and rerun integrated checks before merge. The graphify executable is unavailable locally; graph refresh is NOT RUN and generated artifacts are not added.
Language/VNPay integration dependency: both branches change DESIGN.md; MemberCheckoutPage.tsx/test; MemberPackagesPage.tsx/test; VnpayPayButton.tsx; VnpayReturnPage.test.tsx. Do not resolve by choosing an entire branch version. Preserve render-time translations/source-message metadata and API error handling from Language AND pageshow/request-version invalidation, backend-authoritative cancellation guards, pre-payment history validation and all regression tests from VNPay. Prefer reviewing/landing VNPay functional changes first, then manually integrate Language over the updated base and rerun combined membership/payment/language tests. Draft status does not imply sandbox acceptance.
Three-way overlap check (base 80d7c8e7; LF-normalized scratch copies; no merge applied): conflicts in DESIGN.md (1 region), MemberCheckoutPage.test.tsx (1), MemberCheckoutPage.tsx (3), MemberPackagesPage.test.tsx (1), MemberPackagesPage.tsx (5). VnpayPayButton.tsx and VnpayReturnPage.test.tsx merge textually without conflict but still require combined semantic regression testing. These branches are separately reviewable Drafts; do not merge both unchanged or resolve conflicts by selecting an entire file. A follow-up integration on the existing Language branch after VNPay review is required before both can merge.
Publication verification rerun: frontend 848/848 PASS, ESLint PASS, TypeScript/production build PASS. Sequential checks, one worker, Node heap capped at 1536MB. Bundle parity rechecked: 987 unique keys each, no duplicates, no missing/extra VI/EN/default keys. Browser NOT RUN; source/user/backend content limitations remain. Ready for Draft review with VNPay integration dependency; not merge-ready unchanged.

Staged whitespace check found one trailing blank line at EOF in api.language.test.tsx; removed without behavioral changes. The affected test was rerun afterward: 1/1 PASS. Staged diff check PASS; staged artifact/high-signal secret scan PASS (27 files, zero matches).
