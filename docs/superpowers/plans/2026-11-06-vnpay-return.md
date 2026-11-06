# Leader VNPay return reconciliation implementation plan

Goal: restore authoritative membership state after browser Back without inferring payment outcome or changing Finance policy.
Base: origin/main 80d7c8e7; independent branch fix/leader-vnpay-return. Leader feedback is directly assigned; related backlog SCRUM-71 (membership), SCRUM-80 (Finance) and SCRUM-86 (member packages). No fabricated Jira key, prototype, protected branches or schema/database operations. Publication was subsequently authorized by the user: commit and non-force push this existing branch, then provide a Draft PR creation link; do not merge.

- [x] Inspect existing checkout, membership cancellation, signed return/IPN, settlement locks, stale-attempt grace and idempotency; identify bfcache and frontend/backend cancellation mismatch.
- [x] Baseline targeted frontend tests: 69 passed.
- [x] Write red regressions for bfcache status reload, pending online cancellation, rejected live attempt/retry and settled checkout; reproduce four failures.
- [x] Add pageshow revalidation, block actions while return sync runs, revalidate prepared targets before payment. Preserve authoritative backend guard and distinguish online checkout from cashier transfer review.
- [x] Run targeted/full frontend tests, lint/build and backend mock policy/Finance/membership tests; inspect diffs and scan for secrets.
- [x] Attempt real browser verification without database/payment writes; mark sandbox E2E NOT RUN unless credentials/environment were explicitly provided.
- [x] Write QA evidence, manual steps, remaining risks and review integration notes. Subsequent publication authorization is recorded above; no actual PR or merge is performed.
