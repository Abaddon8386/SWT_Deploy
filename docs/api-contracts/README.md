# API contract workflow

The API team publishes an OpenAPI YAML/JSON export here when an endpoint is ready for frontend integration. Every change must specify request, successful response and common error response.

Frontend may use a local mock matching the contract, but must remove the mock before the Jira ticket is moved to Done.

`openapi-public.yaml` defines the anonymous, read-only landing catalog. It shares package, coach and session data with the authenticated portal; fixture data in browser verification scripts is never used by the application.

[`openapi-pwa-checkin.yaml`](openapi-pwa-checkin.yaml) defines signed gate QR generation and authenticated Member self check-in for the Android/iOS portal PWA (SCRUM-75/83/87 extension).

[`openapi-session-booking.yaml`](openapi-session-booking.yaml) defines per-session class booking: one session, any hand-picked set, a week or a month, and their cancellation.

## Sprint 3 Contract Files
- `openapi-sprint3-operations.yaml`: Session attendance and class session cancellation (`SCRUM-111` to `SCRUM-115`).
- `openapi-sprint3-coaching-analytics.yaml`: Training plans, AI workout recommendations, session evaluations, and class utilization reports (`SCRUM-116`, `SCRUM-117`, `SCRUM-119`, `SCRUM-120`).
- `openapi-sprint3-ai-chat.yaml`: Member AI Chatbot sessions and messages (`SCRUM-118`, `SCRUM-126`).
- `openapi-sprint3-member-progress.yaml`: Member training item completion checklist (`SCRUM-129`).
