# SCRUM-128 support realtime deployment review

No database, API startup, environment, or signing configuration was changed while implementing this source change.

- Hibernate Code-First adds nullable UUID support_request_messages.client_message_id and unique constraint uq_support_message_client on (support_request_id, sender_user_id, client_message_id). Existing rows keep null; no arbitrary backfill. PostgreSQL permits multiple null keys, preserving legacy sends. Review Hibernate schema synchronization in the authorized dev/test deployment before production rollout.
- DatabaseTriggerProvider/PostgreSqlTriggerProvider installs the support request/message transactional invalidation triggers after Hibernate, together with private receive and restrictive receive/send policies on realtime.messages. Only public owns global policies; isolated test schemas do not modify them. Do not execute a manual migration or historical schema script.
- Reuses existing app.supabase.url, app.supabase.publishable-key, app.supabase.chat-jwt-secret. The existing chat JWT signing secret must match a signer accepted by this Supabase project's Realtime JWT verifier. Only a publishable key goes to clients. Missing configuration disables realtime while REST remains available.
- Support JWTs expire after five minutes, grant receive on one exact topic through scms_support_topic and scms_support_scope, and do not grant chat scope. Topic names are private capabilities backed by signed RLS claims, never treated as secrets themselves. Restrictive guards apply TO PUBLIC so broad pre-existing anon/PUBLIC policies cannot bypass support isolation; only authenticated receives with matching claims are allowed. Browser clients cannot broadcast support events. Sessions must be renewed through the authenticated API. Revoked users may retain empty invalidations until token expiry; every REST read/write still validates the current active actor.
- changed events contain only {}. PostgreSQL realtime.send runs in the writing transaction; delivery occurs after commit and rollback emits no committed event. Realtime failures are best effort and must not lose saved messages. REST refresh on reconnect/focus supplies reconciliation.
- Send and status updates serialize on the same pessimistically locked ticket. A retry with the same UUID and trimmed content returns the original message without another save or notification, even if the ticket subsequently closed. Reusing a key for changed content is 409. Sending a new message to a closed ticket is 400.
- Verification performed here is limited to mocked/static unit checks; actual Hibernate schema upgrade, Supabase JWT acceptance, RLS isolation, commit/rollback delivery, and two-browser behavior require a separately authorized deployment/test session. No DB integration test has been run.

## Operational rollback plan — review only, do not execute automatically

### 1. Rollback criteria

Stop rollout for cross-account access, unauthorized subscription/broadcast, message loss or duplication, incompatible schema synchronization, or regression in Direct Messages/membership updates. A ticket-only connection outage can use REST/manual refresh while investigated; it does not justify deleting history. The incident owner records the reason, affected release, maintenance window and authorized operator. A suspected shared signing-key compromise requires a separate security response, including coordinated key rotation; application rollback alone cannot revoke an exposed key.

### 2. Preflight and recovery point

- Record deployed frontend/backend versions, the stage-1 baseline (`c4f849b`), database schema, application database role and Supabase Realtime configuration. Confirm the actual schema matches the release; do not infer deployment from repository source.
- Inventory definitions, owners, enabled state and grants for the two support triggers, their function, the three support policies and every existing `realtime.messages` policy, including permissive policies for `anon`, `authenticated` and `PUBLIC`. Save approved definitions in the operator's protected change record, without exposing secrets.
- Check message/request row counts, recent successful writes, `client_message_id` nullability, UUID column type, `uq_support_message_client` and current subscriptions. Preserve these baselines for comparison.
- Obtain and verify an authorized backup/PITR recovery point covering support history, keys, relationships and policy/function/trigger definitions. Rehearse restoration in an isolated environment. Arrange write quiescence if a structural repair is required; account for writes after the recovery point before any restore.

### 3. Application rollback versus database rollback

Prefer a coordinated frontend/backend rollback to the tested stage-1 release, retaining database objects and all history. The previous application has no ticket realtime-session endpoints; do not intentionally pair the stage-2 frontend with that backend, which would repeatedly request unsupported sessions. Stage-1 manual refresh remains the fallback.

The additive nullable UUID column is compatible with stage-1 inserts, which leave it null; the PostgreSQL composite unique constraint permits those null keys. Stage-2 clients provide UUID keys, while legacy sends do not gain idempotency guarantees. Confirm this compatibility on the deployed PostgreSQL schema before rollback. Retain the column, stored UUIDs and constraint by default. Returning to stage 2 must preserve those keys so previously saved requests can still be reconciled.

Reverting the application does **not** remove already-installed support triggers/policies or the UUID column/constraint. The older trigger provider does not explicitly remove these new objects. Both versions run Hibernate/provider installation at startup: review the exact release and startup effects before restarting; never treat startup as a read-only rollback check.

### 4. Disable ticket realtime without affecting saved conversations

There is no ticket-only runtime feature flag in this release. Do not clear `app.supabase.chat-jwt-secret`, change the shared publishable key or disable all Realtime: Direct Messages uses the same configuration. Use the coordinated stage-1 application fallback to stop new support-session issuance and ticket subscriptions, leaving authenticated REST history/send available.

If database publication must also stop, a DBA may approve disabling only `trg_support_request_realtime` and `trg_support_message_realtime`. Keep both restrictive support guards effective. Do not delete requests/messages or weaken REST ownership checks. Existing support JWTs have a five-minute lifetime; verify actual socket/session expiry or disconnection in Supabase rather than assuming app rollback immediately revokes them. For an urgent access incident, security must coordinate session disconnection while retaining fail-closed policies.

### 5. Database rollback requiring DBA/security approval

Review the proposed object-level changes against the saved definitions and rehearse them in an authorized test project. Restrict any changes to these support objects:

- Publishers: `trg_support_request_realtime`, `trg_support_message_realtime` and `scms_support_realtime_invalidation`. Stop publishers before considering function removal; retain the function unless there is a demonstrated reason to remove it.
- Policies: `scms_support_receive`, `scms_support_receive_guard`, `scms_support_send_guard`. After issuers/subscribers and publishers stop, the permissive receive policy may be withdrawn if approved. Keep the restrictive receive/send guards by default: removing them can expose the namespace through another broad permissive policy. Any eventual removal requires proof that anonymous and authenticated clients cannot regain support-topic access.
- Schema: retain `client_message_id` and `uq_support_message_client`. Removing a constraint requires an explicitly reviewed compatibility/concurrency assessment and a path to validate/reinstate uniqueness. Column or history deletion is not a normal rollback step. An incompatible schema repair needs a separate approved change and tested recovery procedure.

No executable rollback SQL, manual migration, shared-database command or secret change is provided here. All database operations require the authorized operator's reviewed procedure. Before restarting a stage-2 backend, remember its provider will reinstall its source trigger/policy definitions; align the deployment procedure with the intended disabled/enabled state.

### 6. Protect other realtime features

Compare policy definitions/grants with the preflight snapshot. Do not alter `scms_chat_*` policies, DM triggers, membership triggers, or unrelated channels. In an authorized test environment, verify DM participants can receive their own inbox, outsiders cannot, and send restrictions still hold. Verify membership Broadcast still triggers its owner's authenticated API refresh. Test anonymous, DM-scoped, support-scoped and unrelated authenticated tokens against the support namespace and non-support channels; include existing broad permissive policies when checking isolation.

### 7. Recovery if the database change is incompatible

Pause affected writes and preserve an incident copy before repair. Restore the approved backup to an isolated recovery target first; validate relationships, message IDs, UUIDs and history completeness. Prefer restoring compatible object definitions or repairing only the affected objects over replacing the shared database. Any shared restore requires explicit owner approval, a reconciliation plan for post-backup writes and verification that other modules retain their data. Do not overwrite newer support history as a default rollback action.

### 8. Post-rollback checks

Verify Member A cannot read/send in Member B's ticket, inactive/deleted actors are denied, staff access follows current roles, closed tickets reject new sends, and history survives page refresh. Exercise create-ticket popup, staff reply/status, loading/error/retry and manual refresh on both roles. Compare saved history/key baselines, confirm intended trigger/policy states and inspect errors without logging conversation contents or tokens. Recheck Direct Messages and membership updates. Record actual results separately from mock/static tests; live checks remain NOT RUN until authorized execution.

### 9. Redeployment gate

Fix and regression-test the rollback cause, obtain DBA/security approval for schema and policy differences, and rehearse upgrade/rollback in a separate Supabase test project. Verify accepted JWT signer, exact-topic isolation (including anonymous clients), concurrent UUID retries, closed/send serialization, commit-only delivery, rollback without delivery, reconnect catch-up and two-browser Member/Receptionist behavior. Confirm the backups, retained idempotency keys, compatible frontend/backend pair and staged activation order before rollout. Re-enable only reviewed support publishers/policies and monitor results; no live deployment is authorized by this document.
