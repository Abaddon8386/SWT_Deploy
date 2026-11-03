# Landing disciplines and loading states — 2026-11-01

## Behavior

- (Lỗi thời — xem DESIGN.md 03/11/2026: danh mục chuẩn hiện là Gym, Bơi lội, Boxing, Tennis, Cầu lông, Yoga; Pilates và bộ môn ngoài danh mục bị ẩn khỏi portal.)
- Landing and Member Classes share the SCRUM-88 main disciplines: **Gym, Yoga,
  Pilates, Boxing**, in that order. Gym remains the main discipline. Extra discipline
  names from actual portal schedules remain available. The Gym filter includes the
  existing catalog name `Olympic Strength`.
- Preserve the existing section layout, type, native scrolling, forward/reverse
  transitions, keyboard navigation and reduced-motion behavior. Reuse existing
  discipline illustrations. Below-fold illustrations load lazily with async decoding.
- Shared, static, theme-aware skeletons cover startup, lazy route modules and data
  regions across public catalog, member, staff, coach, manager, support and messaging.
  Keep existing bespoke skeletons where they already fit the layout. Busy write
  actions retain their button status; the AI reply retains its typing indicator.
- Image placeholders preserve the native image element and priority, settle on
  load/error, and reset when the source changes.
- Retrying the public catalog clears the previous error while loading. No minimum
  skeleton display timer is introduced. Independent coach roster requests run in
  parallel and preserve the existing ordering, partial results and fallback behavior.
- Delayed logout still shows a route skeleton after the local session is cleared.
  POS payment is blocked, including direct form submission, while another member
  lookup is pending. Class creation waits for its selection catalogs and supports retry.

## Verification

- `npm test -- --maxWorkers=2`: **72 files, 469 tests passed**. Worker concurrency is
  bounded for this local machine; an unrestricted run exhausted available memory.
- `npm run lint` and `npm run build`: passed.
- Deferred-request regression tests cover initial routes, portal navigation/logout,
  invoice list/detail, chat directory/thread, support, class catalogs, coach members,
  POS lookup/payment and image source changes/errors. Tests reveal data without
  advancing a display-delay timer.
- `scripts/verify-loading-states.cjs`: passed Light/Dark at 390/1440px, including
  reduced motion on mobile, held startup JS, catalog error/retry, image buffering,
  public module loading, preserved portal navigation, invoices and delayed logout.
  Measured after releasing intercepted responses on the final build: catalog
  53–95ms; invoices 25–38ms.
- `scripts/verify-public-ui.cjs`: passed eight viewport widths, auth/OTP flows,
  existing member links, gallery, filters, BMI and FAQ.
- `scripts/verify-catalog-sync.cjs`: passed price/catalog parity, real DTOs,
  trainer details, seven widths, empty/error/retry states.
- `scripts/verify-public-animation.cjs`: passed replay in both directions,
  stable partially visible content, live reduced motion and no-observer fallback.
- `scripts/verify-sport-story.cjs`: passed Light/Dark at nine viewport configurations
  each, reverse scroll, sticky boundaries, keyboard, native wheel and reduced motion.
- `scripts/verify-ux-consistency.cjs`: passed 13 routes, five dashboard widths,
  existing layout, themed controls, dialogs, pickers and empty/error states.
- Independent code review found the logout and POS buffering issues; both were
  fixed with regression tests and reviewed again. `git diff --check` passed.

Browser verification used a local production preview and intercepted API responses.
The response-to-render timings do not measure production server/network latency.
No backend contract, database or production data changes were needed.

## Visual evidence

- [Desktop disciplines](../ui-review/landing-loading-2026-11-01/disciplines-desktop.png)
- [Mobile disciplines](../ui-review/landing-loading-2026-11-01/disciplines-mobile.png)
