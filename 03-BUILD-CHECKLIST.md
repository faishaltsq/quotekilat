# QuoteKilat Hermes — Build checklist & stage gates

Check boxes only after actual implementation and verification. Do not mark future-phase integrations as completed on the basis of UI mocks.

## Phase 1 — working guest product (Hermes first execution)
- [x] Inspect repository, create `DECISIONS.md` and `IMPLEMENTATION_STATUS.md`.
- [x] Setup strict TypeScript, lint, prettier if appropriate, Vitest and Playwright or equivalent available test runner.
- [x] Use responsive theme and visual reference with light minimal styling.
- [x] Hero with REAL quote builder above the fold / near top on phone.
- [x] Tabs for Barang/Jasa/Custom with properly labeled dynamic inputs.
- [x] Computation: quantity, materials/labor, extras, variable sales fee, gross margin, rounding.
- [x] Live result shows cost, recommended price, profit and actual gross margin.
- [x] Margin guard for discount below target; error states for impossible or negative inputs.
- [x] Working quote preview, real clipboard action, real generated PDF (not a fake button).
- [x] Non-sensitive local draft autosave and explicit clear action.
- [x] Accessible keyboard support, form errors, color contrast and focus indicators.
- [x] Parallax: 2–3 subtle abstract invoice layers, reduced motion honored, simplified mobile.
- [x] Honest sections: value features, how-to, proposed pricing, AI teaser labeled not live, FAQ, footer.
- [x] No initial auth wall, no fake trust claims, no unsourced market-price examples presented as real.
- [x] Unit tests for calculations; component tests and desktop/mobile smoke tests.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass or genuine blocker documented.
- [x] README for local run, controls and architecture, `.env.example`, summary with limitations.

## Phase 2 — cloud account, explicitly requested later
- [ ] Auth only on cloud-dependent actions; restore guest draft after return.
- [ ] SQL migrations with restricted grants, RLS, indexed owner columns.
- [ ] Cloud save, list, edit, duplicate, delete; authenticated account-only.
- [ ] Atomic server-enforced Free monthly saved-quote quota.
- [ ] User A cannot read/write User B quote in tests.
- [ ] Logout preserves expected local guest UX and does not leak another user data.

## Phase 3 — AI beta, explicitly requested later
- [ ] Configurable server model adapter, secret server-side only.
- [ ] Optional Smart Input after explicit submit/consent, strictly structured JSON, apply confirmation.
- [ ] Server-side throttling, usage quota, prompt length limits and safe logs.
- [ ] Market source URLs/time/units and comparability checks; no fabricated price or source.
- [ ] No real data -> honest unavailable/insufficient-data state.
- [ ] Price engine remains single source of truth even when AI proposes assumptions.

## Phase 4 — Billing, explicitly requested later
- [ ] Verified merchant account and subscription/payment eligibility.
- [ ] Midtrans sandbox checkout and verified idempotent webhook.
- [ ] Backend is sole authority for entitlements and quotas.
- [ ] Failed/canceled/expired payment states and upgrades/downgrades tested.
- [ ] No production charge without explicit owner approval.

## Go/no-go user validation
- [ ] At least 15–20 test users attempt a real quotation, from multiple target sectors.
- [ ] Track task completion and minutes-to-quote vs their prior method.
- [ ] Verify interest in cloud saving and ongoing usage before prioritizing Pro billing.
- [ ] Verify willingness to pay for market research separate from novelty of AI.
