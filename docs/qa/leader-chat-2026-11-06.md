# Leader chat controls review — 6 November 2026

Scope: existing Messages/Support chat, SCRUM-106 / SCRUM-128 (human conversation), SCRUM-118 / SCRUM-122 / SCRUM-126 (existing AI integration). No new backend behavior or API contract.

## Findings and causes

- Human ChatThread duplicated an older composer instead of using ChatComposer: mouse-only emoji spans, inactive microphone/image/sticker tools, portal textarea styling, and a send button that shifted the input when typing. DESIGN already specified the shared stable composer.
- Header/back/emoji/new-session controls mixed 34–36px targets and 18–22px icons; standalone chat still used blue accents while the floating panel used salmon.
- AI allowed drafting while sending. On a rollback or delayed first-session creation, the old send callback could replace that newly typed draft. Its existing synchronous busy guard already prevents duplicate calls; keep that guard and lock composing until the operation completes.

## Changes

- ChatThread now uses ChatComposer; actual emoji and local heart interactions are semantic keyboard-accessible buttons. Removed inactive tools.
- ChatComposer provides localized send/retry/pending names, emoji accessible names and native title tooltips through the existing useI18n hook. Send remains fixed at 72px and has a small pending marker plus aria-busy.
- Back, close, expand, new session and new conversation have names/tooltips; expand announces its pressed state. Chat controls use minimum 44px targets and consistent 20px icons, salmon action/focus colors and reduced-motion transitions. The existing 48px new-conversation floating control remains in place.
- AI composing locks during loading/sending; no change to session/history APIs, realtime subscription, retry idempotency or human draft handling.
- Scoped rules recorded in DESIGN.md. No schema, Supabase configuration, backend, Finance, route or permission changes.

## Files

ChatComposer.tsx, ChatThread.tsx, AiChatThread.tsx, ChatPage.tsx, ChatWidget.tsx, chat.css, chat-widget.css and focused chat tests under apps/web/src/features/chat; DESIGN.md and this report.

## Verification

- Baseline: npm.cmd test -- src/features/chat — 6 files, 38 tests passed.
- RED: human composer regression and pending AI composer regression both failed before implementation for the expected behavior.
- Targeted after changes: npm.cmd test -- src/features/chat — 7 files, 43 tests passed.
- Regression coverage includes shared human composer, semantic emoji/focus, stable send node, no inactive attachment tools, AI pending locks/duplicate submission, physical Enter versus Shift+Enter/IME, blank/pending submit guards, and reactive English button labels/aria/tooltips.
- Existing tests still cover human retry UUID reuse, cross-thread draft isolation, realtime catch-up, older history, close/reopen draft retention and unread behavior.
- The first unrestricted full test run plus concurrent lint/build exhausted host memory (Node Zone Allocation failed); it is not treated as a code failure. Sequential validation with one test worker completed successfully.

- Full suite: npm.cmd test -- --maxWorkers=1 — 128 files / 845 tests passed, exit 0 (162.31s). Existing unrelated tests log refused localhost:3000 connections but the suite exits successfully.
- Final targeted check after language-managed markers: npm.cmd test -- src/features/chat --maxWorkers=1 — 7 files / 43 tests passed, exit 0.
- npm.cmd run lint — exit 0, no warnings/errors.
- npm.cmd run build — exit 0; final repeat after CSS cleanup also exit 0.
- Added data-i18n-managed to translated controls/composer and native message text/peer names so the legacy language observer cannot rewrite user messages. Unmigrated chat state text retains the existing translation path.

## Browser and integration limits

Browser/mobile visual QA: **NOT RUN**. Computer Use getState returned no apps or browsers: native pipe unavailable and browser access host unavailable. No screenshots were fabricated. Desktop/mobile layout, light/dark contrast, reduced motion and actual device tap targets need a browser follow-up. Live server/realtime/session integration: **NOT RUN**; this pass uses existing mocked frontend API tests and never creates backend data.

## Parent follow-up — complete source-owned chat labels

Parent review found VI-only retry/older/loading/empty/transcript labels outside the initial button pass. Follow-up RED tests reproduced two English-label failures. Added explicit existing useI18n pairs across ChatThread, ChatPage, ChatWidget, ChatContacts, AiChatThread and role-label presentation. All chat roots now managed; peer names, drafts, server errors and messages are preserved verbatim even when they equal UI phrases. Existing hook error payloads retain their server/source wording; no error/session/API transport behavior is changed. Tests explicitly preserve peers named Tin nhắn, native text Tìm and server error SERVER: Gửi.

Follow-up focused GREEN: 48/48 tests in8 files. Files additionally include ChatContacts.tsx, chatApi.ts (optional presentation translator for chatRoleLabel only), ChatThread.test.tsx and ChatWidget.test.tsx. Final full/lint/build parent rerun pending below. No new chat functionality or dependency.

## Final parent verification (supersedes earlier totals)

- Focused chat tests: 48/48 PASS across 8 files.
- Full frontend suite: 850/850 PASS, zero failed, one worker; JSON report stored outside the worktree in ../logs/chat-tests.json.
- ESLint: PASS (exit 0).
- TypeScript and production build: PASS (npm.cmd run build, exit 0).
- Browser desktop/tablet/mobile, light/dark, console and live realtime/session E2E: NOT RUN because browser access is unavailable.
- No commit, push, PR, backend or shared database changes.
## Authorized publication review

The user explicitly requested commit and non-force push of this existing branch, with a Draft PR creation link into main. This is a direct leader assignment; no fabricated Jira ticket is added. Worktree and branch scope are preserved; no new workspace, backend source, Finance policy, schema or shared database changes.

Browser retry: NOT RUN. Computer Use returned no browsers/apps, native pipe unavailable and browser access host unavailable. Desktop/mobile/tablet, light/dark, browser console and actual session behavior require manual verification before merge. Mock tests are not reported as browser verification.

Fetched origin/main is c814e7c0, five commits beyond this branch base 80d7c8e7. Main integration is not silently rebased/merged; review current main configuration and rerun integrated checks before merge. The graphify executable is unavailable locally; graph refresh is NOT RUN and generated artifacts are not added.
Publication verification rerun: full frontend 850/850 PASS; ESLint PASS; TypeScript/production build PASS. Sequential checks, one Vitest worker, NODE_OPTIONS --max-old-space-size=1536. Main overlap: DESIGN.md only. Browser remains NOT RUN. Ready for Draft review, not UI acceptance.
