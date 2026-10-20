# QuoteKilat — Complete Product, UX & Technical Blueprint
Version: v1.0 · Indonesia-first · Hermes Agent handoff · 20 October 2026
Status: product direction/specification, not an implementation or validated market demand.

---

## 0. Executive brief

**Product name:** QuoteKilat
**Product category:** Product-first freemium SaaS for pricing and quotation.
**Audience:** Indonesian freelancers, service providers, online sellers/resellers and custom-order businesses, especially those who repeatedly need to decide a price before sending an offer to a client.
**Primary job to be done:** "I have a customer request; help me calculate a financially sound price and send a professional quote in minutes."
**Positioning:** Pricing-first. NOT chatbot, accounting software, ERP, full CRM, or generic invoice-only generator.
**Suggested Indonesian tagline:** "Hitung tepat. Tawarkan cepat."
**Differentiation hypothesis:** no-signup quote creation; exceptionally fast form; transparent margin calculations; useful contextual AI when actually needed; credible price references (when available); WhatsApp-first export.
**Market reality:** pricing, quotation generators, and printing-focused AI price research already exist. Differentiation must be validated through real user tests, not stated as proven.

### Non-negotiable UX constraints
- First visit: functionality, not a login screen. Hero includes a REAL calculator / quote builder.
- Guest can complete the job end to end: calculate, view quote, copy a WhatsApp-friendly message, export PDF. No dark pattern.
- Registration is requested ONLY upon a user action that requires cloud identity (save to cloud, cloud history, subscription, server-side AI quotas). Preserve all work through auth flow.
- AI invisible: contextual Smart Input and Market Insights, each on demand. NEVER a chat-first or chat-sidebar UX.
- Visually minimal and polished; whitespace and hierarchy above decorative effects.
- Parallax background very subtle and relevant to pricing, only in hero. Page must also look excellent without animation.
- Do not invent customer ratings, case studies, counts, user testimonials, competitor market prices or AI responses. All demo content clearly labeled.

---

## 1. Information architecture / routes

### Public (no login)
- `/` Product-first landing + live quote builder (main conversion path).
- `/pricing` Optional dedicated pricing details; landing includes summary.
- `/privacy`, `/terms` Plain-language privacy and legal pages, initially marked as draft for founder review where necessary.

### Authenticated (added in Phase 2)
- `/app` Workspace: New Quote primary action; recent quotes secondary.
- `/app/quotes` Saved cloud quotations (list/search/duplicate/edit).
- `/app/quotes/:id` Quote detail/preview.
- `/app/settings` Business profile, currency/locale, defaults, data/export/delete, billing access.
- `/app/billing` Plan and usage (Phase 4).
- `/auth` Optional magic link / OAuth flow. NOT the destination of the hero CTA.

### URL/CTA expectations
- Main CTA: `Buat Penawaran`, scroll to/focus builder or open its result preview.
- Navbar minimal: logo, `Cara Kerja`, `Harga`, `FAQ`, `Masuk` (quiet, secondary).
- No "Get Started" button which opens signup before the tool has been tried.
- User returns from auth to same draft; cannot lose partially entered data.

---

## 2. Visual design direction

### Overall impression
Clean, airy, trustworthy and modern: closer to a refined fintech productivity tool than a flashy AI startup. Use `visual-reference.png` for tone only. Screenshot is a mockup and contains illustrative numbers/features; do not copy any fake trust claim or price source verbatim.

### Palette / typography (starter tokens; adjust after contrast testing)
- Background: #F8FAFD, optionally white #FFFFFF.
- Headings: #17223C; body: #52617D.
- Primary interactive accent: #5B78F6 (muted periwinkle/indigo).
- Accent hover: #4262DF; faint accent background: #EEF2FF.
- Positive outcome: #078966 (use only for results/success, not decorative badges).
- Borders: #E6EAF2; error: #C94444; focus ring must remain accessible.
- Rounded cards 16–22px; inputs 10–12px; gentle subtle shadow, no heavy glow.
- Typography: Inter / Geist / Plus Jakarta Sans via performant font loading and system fallback; headings semibold/bold; readable body text. 1–2 type families MAX.
- Avoid unnecessary gradients, colored headings per word, bright multi-colored icons, glass overload.

### Hero desktop (recommended max width 1180–1240px)
- Navbar height ~70–78px.
- Two columns, ~44% copy and ~56% actual interactive QuoteBuilder. Gap ~48–70px.
- Left: compact pill `Gratis • Tanpa daftar • Langsung pakai`, strong 2-line title (`Harga yang tepat, penawaran lebih cepat.`), short supporting sentence, three concise value points, optional small `Coba langsung di sini` cue.
- Right: one primary QuoteBuilder card only. No floating sidecards overlapping inputs.
- Provide breathing room. Main calculator card must be the visual anchor.
- No user counts, review scores or fake logos unless independently verified.

### Mobile
- Navbar simplified with logo and subtle `Masuk` action.
- Short hero heading; show the actual builder immediately after intro (prefer above excessive marketing paragraphs).
- Full-width form; 44px+ hit targets; no tiny controls; no horizontal scroll.
- Separate mobile-friendly output card; sticky action only if it does not cover inputs or keyboard.
- Condense or hide decorative parallax, keep performance high on low-end devices.

### Hero parallax (restrained)
- Exactly 2–3 abstract invoice/quotation sheets or outline document shapes behind foreground, low contrast, blurred as needed. No literal product photos, calculators, coins, oversized stats cards, user avatars, or scattered icons.
- Subtle layered motion: nearest offset <=24px across hero visibility, farther layers <=12px, minimal rotation (<=3deg). Animate transforms only with `requestAnimationFrame` when needed. Restrict to hero, do not scroll-jack.
- Use CSS/SVG primitives rather than shipping large raster assets; pointer-events none; aria-hidden. Opacity about 0.06–0.14 depending on layer and contrast. Never put legible fake invoices on background.
- Respect `prefers-reduced-motion: reduce`: entirely disable parallax/transforms. On mobile <=768px: static or hidden.
- Avoid animation dependencies for this effect unless justified; IntersectionObserver/scroll handlers must be passive and cleanup correctly.

### Landing page below hero
1. Small 3- or 4-item functional benefit strip (minimal, ideally no card frames).
2. How it works: `Masukkan biaya` → `Tentukan margin` → `Buat & bagikan penawaran`.
3. Market Insights teaser: one understated sample panel, clearly `Contoh tampilan`, labeled coming soon until working. Show what source link/date/confidence would look like without fake verified market data.
4. Pricing: Guest/Free and Pro proposed tiers; concise, no inflated badges like `#1`.
5. FAQ covering free guest, data storage, gross margin vs markup, AI availability, validity of market price, tax exclusions.
6. Footer: privacy, terms, contact placeholder only when known; no invented address or company registration.

---

## 3. QuoteBuilder UX / main journey

### Default state
- Tabs/segmented control: `Barang`, `Jasa`, `Custom`.
- Pre-populate with transparent **sample** amounts, label `Contoh data — bisa diubah` or empty inputs with sensible placeholder. User can reset.
- Main actions: `Buat Penawaran` (primary), `Salin WhatsApp`, `Unduh PDF` (real actions). `Simpan ke Cloud` optional secondary gated by login.

### Shared fields
- Item/layanan/pesanan name (required, max sane length).
- Customer name (optional in guest mode), notes (optional).
- Currency: IDR default; future architecture allows others, but only IDR calculations/formatting in MVP.
- Target gross margin 0–80% (recommended UI 10–60), with tooltip differentiating markup.
- Discount (fixed or percent), optional extra costs, rounding increment IDR (100, 500, 1000). Default 1000.
- Clear label for *what* numbers cover; cost items must not be confused with selling price.

### Barang mode
- Quantity (positive integer), unit cost, packaging/additional per-unit expenses, fixed order expenses, optional fee % of sale.
- Cost = quantity × (unit cost + additional unit costs) + order fixed costs. Further costs included only once.

### Jasa mode
- Hours or deliverables quantity, internal labor cost/hour (NOT hourly price charged to customer), subcontractor costs, fixed expenses, optional platform percentage fee.
- Time estimate is a cost input; don't label it revenue.

### Custom mode
- Combined materials, labor, finishing, optional waste %, fixed expense, quantity. Show advanced input only when expanded.
- Waste applies to the material base only unless the user expressly chooses otherwise.

### Result area
- Base cost, variable selling fees, suggested minimum sell price (label if rounded), expected gross profit, *actual* gross margin, margin guard indicator.
- Optional unit selling price when quantity>1, while clarifying order-level fees and rounding.
- Quote preview includes business name (if configured), customer (optional), line items, terms, quote date, quote number, validity (optional).
- Generic quote PDF must work without authentication. Printing/PDF should never silently submit personal data to any third party.
- Toast on clipboard success/failure; fallback manually selectable text if Clipboard API blocked.
- Guest local draft: autosave non-sensitive quote state in localStorage, show `Tersimpan di perangkat ini` and `Hapus data perangkat` affordance; explain deletion when clearing browser data.

### Pricing mathematics (mandatory)
All monetary values in **integer IDR**, validated on input. Avoid floating-point currency drift where practical (fixed-point integer math/decimal handling for %). The LLM must never determine or override final calculations.

Definitions:
- `C` = total base cost (materials, labor, waste, fixed overhead, other fixed costs), excluding selling-fee percentage.
- `F` = fixed payment/selling fees, if any, in IDR.
- `r` = variable selling/platform fee RATE as decimal fraction of selling price (e.g. 0.05).
- `m` = desired gross margin RATE as decimal fraction of selling price (e.g. 0.30).
- `P_min = (C + F) / (1 - r - m)`. Reject impossible cases where `r + m >= 1`.
- `P_quote = ceil_to_increment(P_min, rounding_increment)`, then apply optional discount to quoted price and compute displayed *actual* margin after discount. Discount must be reflected in profit and margin guard.
- `sellingFees = r × P_quote + F`, `profit = P_quote - C - sellingFees`, `actualMargin = profit / P_quote × 100%`.
- Taxes must not be implicitly included; label treatment and leave dedicated tax handling to a later, reviewed version.
- Do not say a *margin of 30%* is a *30% markup*; these are different.

Test example 1: cost C=175000, r=0, F=0, margin m=0.30 → minimum P=250000, gross profit=75000, actual margin=30%.
Test example 2: cost C=100000, r=0.05, F=0, m=0.25 → P_min≈142857.14, rounded to Rp143000 (increment Rp1000); sale fee Rp7150, gross profit Rp35850, actual margin≈25.07%.
Test example 3: 10% discount on a calculated quote must lower selling price and actual margin; warn if actual margin falls under target. Zero quantity, NaN, negative expenses, unrealistic percentages must not yield fake prices.

---

## 4. Guest, Free and Pro — product entitlements

### Guest, no login
- Unlimited local calculator usage for reasonable interactive use; no server calls needed.
- Basic quote preview, WhatsApp-ready text, basic client-side PDF, local draft.
- No account, no cloud sync; local drafts can disappear if browser storage is cleared.

### Free Account (proposed initial policy)
- All Guest functions.
- Up to **5 new cloud-saved quotations/month** (do not confuse with a limit on creating *local* quotations; keep local calculator usable).
- Basic cloud history and cross-device access.
- Optionally 2 Smart Input requests/month **only when integration has real quotas and protection**; otherwise show coming soon rather than mock results.

### Pro (proposed market test)
- Initial proposed price **Rp59.000/month** (hypothesis; not validated).
- 100 new cloud quotations/month, branded PDF, reusable business presets, customers list, expanded history.
- AI input parsing up to 40/month and market research up to 10/month ONLY after measuring actual cost, reliability and safeguards. Per-operation usage caps checked server-side, not client-side.
- Upgrade/downgrade, billing status, renewal handling; never promise unlimited AI.

### Upsell moments
- Show login/upgrade only when user clicks cloud save, saved history over quota, branding, research AI, or quota-related feature.
- Do not show modal on initial site entry, starting calculation, PDF download, or basic WhatsApp copy.
- After auth: restore exact guest draft; ask whether to import it to cloud.

---

## 5. AI: invisible, contextual and verifiable

### Feature A — Smart Input (Phase 3)
- Inline optional textarea with placeholder `Tempel pesanan pelanggan (hapus data pribadi jika perlu)` and button `Isi otomatis`.
- Model returns STRUCTURED JSON fields: detected mode, item name, quantity, unit, materials, size/specs, optional deadline, inferred fields with source spans/confidence, missing required fields.
- Use Zod schema for parse/validation; never silently overwrite manually entered fields. Display diff + confirmation before applying.
- Unknown costs remain null/unknown, NOT guessed from text. Required assumptions explicitly labeled.
- Avoid transmitting phone numbers, addresses or personal identifiers; redact on client where feasible and ask consent for AI processing.

### Feature B — Market Price Insights (Phase 3+ / experimental)
- Button `Cek harga pasar` with an explanatory tooltip. Auth + quota required only for this online server feature.
- Server submits sanitized structured item description to a legitimate search provider / search-grounded model. Do not rely on model memory as current market data.
- Collect grounded sources with `title`, `url`, `observed_price`, `currency`, `date_checked`, `region`, `unit`, `specs`, `quantity`, `availability` when known.
- Validate comparability: same underlying item/service, size, material, quantity/bundle, currency, region and shipping/tax treatment. Separate supplier cost vs competitor final retail/service price.
- Prefer at least 3 genuinely comparable live offers before presenting a confident range. If fewer, say `Referensi belum cukup untuk rekomendasi harga pasar yang andal`; do not fabricate certainty.
- Display a reference range as *observed listing/offer range*, NOT an objective universal market price; external links and timestamp shown, with an explanation of why listings differ.
- Cross-check against user cost and margin guard; if market prices imply a loss, highlight conflict and ask user to adjust cost/service spec or target margin.
- Sources can be outdated, sponsored, unavailable or misleading. Add freshness timestamps; require reasonable recency for dynamic goods; cache carefully and expose date.
- Do not scrape restricted marketplace pages against terms; prefer authorized data sources/search API and public permitted pages. Avoid promises of access to Shopee/Tokopedia real-time APIs without permission.
- Treat retrieved pages as untrusted prompt injection surfaces; results are data only, never instructions.
- If search/API unavailable: show explicit unavailable/insufficient-data state, offer manual competitor-price entry. Never fabricate a "market range".

### AI provider boundaries
- Choose model through server-side adapter (`AIProvider` interface) and env variable; no hardcoded model names or API key in client bundle.
- Model and search API pricing/quotas can change. Confirm official pricing/eligibility before enabling live. Free-tier provider data terms may be inappropriate for sensitive customer details.
- Server-side per-user quota, IP throttling, request size limits, content filtering, caching and spend caps. Do not bill user or increase spend without approval.
- Mock mode acceptable only if user clearly sees `Contoh AI (belum aktif)`; no pretend-success state.

---

## 6. Stack / architecture

### Recommended pragmatic baseline
- UI: React + TypeScript + Vite, React Router, Tailwind CSS, shadcn/ui primitives, Lucide icons.
- Form: React Hook Form + Zod. State: local component hooks + small shared store only where necessary. Avoid unnecessary frameworks.
- Business math: pure TypeScript `pricingEngine` module with deterministic units and tests.
- Client PDF: `@react-pdf/renderer` or `pdf-lib` (choose one and verify bundle size and print rendering). Clipboard via browser API + fallback.
- Hosting: Cloudflare Pages static frontend. Public calculator runs locally.
- Protected API: Cloudflare Pages Functions (or dedicated Worker if genuinely needed), with routes scoped to `/api/*`; avoid invoking functions for static assets.
- Auth/cloud db: Supabase Auth + PostgreSQL with Row Level Security. Email OTP/magic link (Google OAuth optional later). No session required for Guest calculator.
- Billing: Midtrans sandbox integration after Phase 3; support subscription access lifecycle and webhooks. Some recurring-payment methods require separate merchant eligibility; don't claim recurring charges succeed automatically for all methods.
- Tests: Vitest + React Testing Library + Playwright. ESLint + TS strict.
- Basic deploy + analytics: privacy-aware, opt-in when necessary; avoid tracking raw customer quotes, costs or pasted chat messages.

### Suggested repo layout
```
/
  src/
    app/              # routes, providers
    components/
      layout/
      quote-builder/
      landing/
      ui/
    features/
      quotation/
      pricing/
      auth/            # later
      market-insights/ # later
      billing/         # later
    lib/
      pricing/         # pure functions, money utils
      storage/         # guest draft
      pdf/
      validation/
    styles/
  functions/
    api/               # backend routes, added later
  supabase/
    migrations/
    tests/
  tests/
    unit/
    e2e/
  public/
  .env.example
  README.md
  IMPLEMENTATION_STATUS.md
```

### Core reusable components
`PublicNavbar`, `HeroCopy`, `HeroParallaxLayers`, `QuoteBuilder`, `QuoteTypeTabs`, `CurrencyInput`, `QuantityInput`, `PricingInputs`, `MarginSlider`, `PricingSummary`, `MarginGuard`, `QuotePreview`, `QuoteActionBar`, `DraftStatus`, `HowItWorks`, `AISpotlight`, `PricingPlans`, `FAQAccordion`, `Footer`, `CloudSaveAuthDialog` (later), `MarketSources` (later).

### Responsive behaviors
- 360/390/430px phones, 768px tablet, 1024+ desktop tested.
- In mobile, QuoteBuilder is primary content, not hidden by giant hero artwork.
- Dynamic input numeric keyboard, accessible labels, prevent losing input focus on rerender, reduce layout shift.

---

## 7. Data model (design contract for Phase 2+)

Table designs; implement migrations and tests when reaching the specified phase, not earlier:

- `profiles`: `user_id` UUID PK (FK auth users), `display_name`, `created_at`, `updated_at`.
- `business_profiles`: `id`, `owner_id`, `name`, `logo_path` optional, `default_margin_bps`, `currency`='IDR', optional contact information, timestamps.
- `quotes`: `id` UUID, `owner_id`, `business_profile_id` nullable, `customer_name` nullable, `kind` enum/check (`goods|service|custom`), `title`, `items` JSONB validated server-side, `cost_breakdown` JSONB, `target_margin_bps`, `computed_price_idr`, `actual_margin_bps`, `discount`, `status` draft/sent/accepted/expired, `quoted_at`, timestamps, `idempotency_key` when creating.
- `pricing_presets`: `id`, `owner_id`, `name`, `kind`, `config` JSONB, timestamps.
- `usage_counters`: `(user_id, period_yyyymm, action_type)` unique, `count`; server-owned, atomic increments.
- `subscriptions`: `id`, `user_id`, `provider`, `provider_subscription_id`, `plan`, `status`, `current_period_start/end`, timestamps; NO user-authenticated self-write privileges.
- `billing_events`: provider event identifiers unique, verified signature metadata and idempotency ledger, received timestamp.
- `market_research_runs`: `id`, `owner_id`, normalized query fingerprint, `sources` JSONB, `checked_at`, `status`, `confidence`, expires_at; minimize stored customer data.

**Security rules:** RLS on every publicly exposed user table, grants restricted to needed roles, policies on `owner_id = auth.uid()`. Test other-user cannot select/update/delete another user's data. Private billing and quotas must only be mutated through server-authorized operations. Supabase service role must NEVER be in browser. Avoid public read of quotations. Policies must protect insert `WITH CHECK` and updates `USING` + `WITH CHECK`.

### Auth and guest migration
- Before login, draft is local. When `Simpan ke Cloud` pressed, store draft locally, start auth, return and offer to import. Duplicate handling must be explicit.
- Do not put quote content/PII in URL parameters or auth provider redirects.
- Clear stale drafts on explicit user request; provide data export/delete action later.

---

## 8. API contracts (Phase 2–4)

Use HTTPS; use auth bearer token and server verification for authenticated endpoints. Validate all input and output. These are planned endpoints; no phantom integrations.

| Method | Endpoint | Function | Stage |
|---|---|---|---|
| GET | `/api/me/entitlements` | plan, effective quotas, usage | P2 |
| POST | `/api/quotes` | create cloud quote with authenticated owner | P2 |
| GET | `/api/quotes` | paginated own quotes only | P2 |
| GET/PATCH/DELETE | `/api/quotes/:id` | own quote only | P2 |
| POST | `/api/ai/parse-order` | structured parsing, quota, privacy | P3 |
| POST | `/api/ai/market-research` | grounded source comparison | P3+ |
| POST | `/api/billing/checkout` | create authenticated checkout session | P4 |
| POST | `/api/billing/webhook` | server-side provider verification, idempotent | P4 |
| GET | `/api/billing/status` | effective plan, renewal date | P4 |

Responses should have predictable typed structure, status and error codes (`AUTH_REQUIRED`, `QUOTA_EXCEEDED`, `INVALID_INPUT`, `RESEARCH_UNAVAILABLE`, `INSUFFICIENT_SOURCES`, `INTERNAL_ERROR`). Never leak provider secrets or verbose stack traces.

AI parse structured output example, *shape only*, not fabricated facts:
```json
{
  "mode": "custom",
  "title": "Stiker vinyl waterproof",
  "quantity": 500,
  "unit": "pcs",
  "specifications": {"size": "5x5 cm", "material": "vinyl", "finishing": null},
  "unknown_fields": ["unit_cost", "deadline"],
  "confidence": 0.89,
  "requires_confirmation": true
}
```

AI price research structured output example, *shape only*:
```json
{
  "status": "insufficient_sources",
  "checked_at": "<ISO_TIMESTAMP>",
  "query": "<NORMALIZED_SEARCH_SPEC>",
  "sources": [],
  "observed_range": null,
  "recommendation": null,
  "message": "Belum cukup referensi harga yang dapat dibandingkan."
}
```

---

## 9. Payment & monetization requirements (Phase 4)

- Proposed Free/Pro details are experiments, not established pricing. Do not charge users before founder verifies business readiness and documents/terms.
- Midtrans can support recurring transactions subject to eligibility/payment methods; initially prefer reliable paid-period entitlement management to pretending all methods are recurring.
- Create checkout order server-side; bind to authenticated user, integer IDR, server-chosen plan amount; never trust `amount` or `plan` from client.
- Sandbox first; run verified provider webhook with signature and/or provider status verification, idempotency, successful/failed/canceled/expired states, period-end handling, support downgrade/cancel.
- Never grant Pro on client redirect alone. No manual setting `is_pro=true` in local storage.
- Graceful behavior during payment provider outages; receipts from provider as applicable; terms, refund/cancellation policy to be legally reviewed.

---

## 10. Accessibility, security and quality

### Accessibility & UX
- Target WCAG 2.2 AA practices (semantic heading hierarchy, labels, keyboard operability, visible focus, contrast, aria for icon buttons, status messages announced appropriately).
- No layout shifts on result updates. High contrast for labels. Form error messages adjacent to fields. No reliance on green/red alone.
- Reduced motion honored; touch targets >=44px; form usable with virtual keyboard.
- Loading and empty states explicit; no broken demo buttons.

### Security / privacy
- Client NEVER receives AI, Supabase service-role, search or payment secret keys.
- Free tier rate limiting on server and bot mitigations where necessary.
- Do not log whole pasted order text; minimize stored personal data, redact before AI requests where possible, consent notice.
- Clear storage policy and data portability/deletion. RLS tests and authorization checks necessary before real users.
- Search results are untrusted; treat prompt injection as content, not instructions.
- Prevent stored XSS in quotations; sanitize plain text; don't interpret user-entered HTML in PDF/preview.
- Avoid unlicensed images and noncompliant scraping. Restrict oversized file/upload payloads.

### Performance
- Prioritize mobile core web vitals; lazy-load AI teaser assets/PDF renderer when necessary; avoid large hero raster images and parallax animations on mobile.
- Functional baseline without JS only informative; app interaction requires JS, but readable marketing content should be rendered promptly.
- No unnecessary analytics or fonts as blocking requests.

### Honest representation
- Don't claim "10,000 users" or "4.9 stars" without evidence.
- Don't fake current competitor pricing and citations.
- Label proposed pricing/beta and pending features. Never show AI results as real if API not wired.

---

## 11. Build milestones / delivery phases

### Phase 1 — Product-first Guest MVP (**BUILD FIRST**)
**Deliver:** Landing hero with functioning QuoteBuilder, 3 modes, deterministic pricing, positive/negative input validations, result card, quote preview, copy to WhatsApp, PDF download, local draft, clear draft, subtle reduced-motion-safe parallax, benefit/how-it-works/pricing/FAQ sections, responsive design, test suite.
**Not included:** live auth, live market research, API keys, cloud sync, payment, paid entitlements.
**Exit criteria:** Browser user can complete an entire simple quote without registering; math and PDF tested; responsive and accessible; no fake features.

### Phase 2 — Free cloud workspace
**Deliver:** Supabase Auth and RLS, cloud save/history, guest draft import, account settings, Free plan 5 cloud quotes/month enforced atomically server-side, cross-device test and isolation tests.
**Exit criteria:** Guest unchanged; logged-in user can save/retrieve only their own quotes; quota and auth guard correctly enforced.

### Phase 3 — Invisible AI beta
**Deliver:** Smart Input parse with user confirmation, server quota/cost logging; Market Insights with grounded sources, matching/confidence and insufficient-data states, opt-in privacy notice, fallback manual reference inputs.
**Exit criteria:** No fabricated market prices, correct source URL/time, graceful failures; LLM cannot override pricing engine.

### Phase 4 — Pro billing + account lifecycle
**Deliver:** Midtrans sandbox, verified webhook events, subscription/paid period entitlements, upgrade/downgrade, billing history/settings, Pro usage quotas, test payment lifecycle.
**Exit criteria:** No Pro on fake callback; no quota bypass; no real charges without approval.

### Phase 5 — Validation and scaling
**Deliver:** Privacy-first analytics for meaningful events, support/customer feedback, pricing A/B validation, monitoring errors/spend, optional presets/mobile PWA.
**Exit criteria:** User retention and payment hypothesis measured before expanding scope.

---

## 12. Acceptance scenarios / test matrix

1. Desktop visitor enters `/`: can see hero and real builder, never redirected to signup.
2. Mobile 390px: all fields visible, no horizontal scrollbar, parallax subdued, CTA accessible.
3. Guest creates Goods with C=175000, margin=30%, fee=0 => P=250000; displays profit 75000.
4. Service hours and rate affect cost predictably; Custom waste affects materials only.
5. Margin and markup are not confused; platform fee % accounted for properly; target margin+fee≥100% rejected.
6. Discount lowers actual profit/margin; below-target warning renders.
7. `Copy WhatsApp` places correct, readable quote text into clipboard or offers fallback.
8. `Unduh PDF` yields readable real PDF with same amounts as on-screen calculation.
9. Reload preserves guest draft; explicit clear removes it and UI reflects new state.
10. User can switch Goods/Jasa/Custom without accidental cross-type data corruption or math errors.
11. No account gates for calculation/basic PDF.
12. `prefers-reduced-motion` disables decorative animation; hero remains visually coherent.
13. In later phases, logged-in user A cannot see/edit user B quotes.
14. Exceeded quotas rejected on server even if frontend edited.
15. AI unconfigured: explicitly unavailable, no fabricated result.
16. AI results with unverifiable/sparse price sources: honest insufficient-data state.
17. Payment spoof/duplicate webhook does not grant duplicate Pro access.
18. Invalid costs, negative quantities, pasted nonnumeric, empty names, long notes handled safely.
19. Build, typecheck, lint, unit tests and e2e smoke pass; status file records genuine results.

---

## 13. Hermes Agent operating instructions

- Inspect repository and explain plan before large edits; preserve existing code. Assume repository may be empty.
- Implement and test one phase at a time. Start at Phase 1. Do not spontaneously add a full auth/billing/AI stack.
- Prefer a coherent small set of dependencies and modular source code, not elaborate boilerplate or faux microservices.
- Read `visual-reference.png`. It is style guidance, not a pixel-perfect page spec. Do not use rasterized screenshot as website background.
- Only execute tools the environment supports. If image/preview/screenshot tools unavailable, explain what was not visually verified.
- Never commit secrets, run destructive shell commands, spend money, or deploy production without approval.
- Maintain `IMPLEMENTATION_STATUS.md` and `DECISIONS.md` describing what actually works vs proposed.
- When encountering a necessary decision, choose the least expensive, safest, reversible default. Ask only for unavoidable credentials/access.
- At end of phase: summarize what changed, commands run, tests with pass/fail, concrete remaining work; do not assert success without verification.

## 14. Suggested immediate working order (Phase 1)

1. Bootstrap / inspect React + Vite + TS, lint, test config.
2. Implement pricing engine + currency helpers + unit tests FIRST.
3. Create design tokens and responsive landing layout.
4. Build QuoteBuilder form with 3 modes, validation and result breakdown.
5. Add preview and real clipboard/PDF actions.
6. Persist draft locally and allow clear/reset.
7. Add minimal hero parallax, reduced-motion/mobile fallback.
8. Finish below-the-fold content honestly (future AI marked not live).
9. Run typecheck, lint, tests, build, Playwright smoke, improve accessibility/performance.
10. Update README and implementation status and provide a useful completion report.

---

## 15. External references for implementer (verify latest)

- Hermes Agent official docs: https://hermes-agent.nousresearch.com/docs/
- Cloudflare Pages Functions: https://developers.cloudflare.com/pages/functions/get-started/
- Cloudflare Pages Functions pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase pricing: https://supabase.com/pricing
- Midtrans subscription docs: https://docs.midtrans.com/reference/create-subscription
- Midtrans webhook verification: https://docs.midtrans.com/docs/https-notification-webhooks
- Gemini API pricing and data handling: https://ai.google.dev/gemini-api/docs/pricing

All quotas, legal terms, model availability and provider plans may change. Verify current official documentation before committing implementation/cost assumptions.

## 16. What NOT to build

- Chatbot widget or conversation UI as product focus.
- Forced register/login to calculate price or export a basic PDF.
- ERP, POS, stock ledger, team roles, project management, CRM automation in MVP.
- Live AI "market prices" without authentic source records.
- Unmetered AI credits, unsecured frontend API keys, fake payment completion.
- Fake social proof, unverified brand partnerships, decorative AI gradients/pseudo-fintech gimmicks.
- Complicated multi-step wizard on first visit when one concise form suffices.

**Core product principle:** "The fastest path from customer request to a sensible, defensible quotation — no signup needed." 
