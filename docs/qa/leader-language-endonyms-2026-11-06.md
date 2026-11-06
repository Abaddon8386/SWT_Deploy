# Language endonym regression — 2026-11-06

## Runtime identity and cause evidence

localhost:5173 is Vite PID18816, launched by npm/cmd from C:/Users/THINKBOOK/OneDrive/Documents/GitHub/SWP391_GROUP1/apps/web (original checkout, main). The served LanguageSetting module confirms that original absolute path. It does not serve this fix/leader-language-sync worktree. Original checkout/process are left unchanged; unrelated untracked scripts observed there are not touched.

PortalShell uses shared LanguageSetting for avatar menu and footer. Its legacy hook targets mainRef; this footer is outside that main. The inspected legacy phrase map does not contain a Vietnamese-endonym-to-English mapping. Therefore the exact mutator responsible for the reported English / English cannot be attributed to this legacy map from source alone. Browser auto-translation/extension remains an unverified possibility; actual browser DOM is unavailable.

Confirmed protection gap: LanguageSetting did not declare its React-managed boundary or opt out of browser translation. Added data-i18n-managed, translate=no and notranslate to both variants, and lang=vi/en to the matching buttons. Source labels remain fixed endonyms; the existing single scms_lang preference and active/aria-pressed expressions remain. Headings continue to render through useI18n. No PortalShell, legacy algorithm, VNPay, API, database or other branch source changes.

## Regression evidence

New test failed RED before the fix because the translation-exclusion contract was absent. GREEN checks both menu/footer names, button language, exactly one active/pressed selection, preserved DOM button identities, ignored legacy observer mutations within the managed controls, VI/EN UI changes, Member route navigation and saved-preference remount (refresh simulation). Existing PortalShell integration tests also run against dashboard/footer/avatar; mocked tests do not establish real-browser behavior.

Final targeted run: 102/102 PASS, zero failures (i18n directory plus Member Support/Packages/Checkout tests), maxWorkers=1, Node heap capped at1536MB. ESLint PASS; TypeScript/production build PASS. Existing tests emit localhost:3000 ECONNREFUSED diagnostics; no browser-console PASS is claimed. Full frontend suite not rerun for this small shared component patch.

Browser actual navigation/refresh/authenticated Member visual verification: NOT RUN. Computer Use returns no apps/browsers, native pipe unavailable and browser host unavailable. Native browser translation behavior is not simulated as browser PASS.

## Preview and manual acceptance

Separate Vite preview http://localhost:5174/member/dashboard runs from this existing i18n worktree; served module absolute path and new protection markers verified by HTTP. Port5173 remains original checkout. Different ports have separate localStorage origins; sign in normally on5174 if required, without sharing credentials/tokens.

On5174, check dashboard footer and avatar: names must remain Tiếng Việt / English. Toggle each language and verify exactly one active selection, header/sidebar/page labels, then visit Member Support and Packages and return to dashboard; refresh and confirm preference persists. If browser auto-translation is enabled, additionally verify the names remain unchanged. Do not perform purchases/cancellations for this UI test.

Files: shared/i18n/LanguageSetting.tsx, new LanguageSetting.test.tsx, DESIGN.md and this report. No commit/push/merge for this follow-up; awaiting user visual acceptance.
