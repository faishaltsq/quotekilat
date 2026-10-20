# QuoteKilat Phase 1 Implementation Plan

## Approved input and scope
The user requested execution of the supplied blueprint. `01-START-HERE-HERMES.md`, `02-MASTER-BLUEPRINT.md`, `03-BUILD-CHECKLIST.md`, and the supplied visual reference define the approved design and Phase 1 scope. This is implementation of that design, not a new product discovery exercise. The directory contains only the kit and is not a Git repository. Preserve the original inputs. Do not deploy, purchase services, enable auth, AI, payments, or cloud persistence.

## Architecture and composition
Primary surface: Configure (a real pricing form); secondary: Decide/Learn (brief landing copy). React + TypeScript + Vite static SPA, React Router for informational pages, Tailwind v4 plus focused CSS design tokens, React Hook Form with Zod, Radix dialog for accessible preview, Lucide icons. Exact compatible package versions and lockfile. Use pdf-lib lazily, with a bundled Unicode font for arbitrary customer text. No external runtime fonts, analytics, or backend. Native fields over custom numeric formatting to preserve cursor and invalid-input handling.

Pure modules own pricing, draft validation, quotation snapshots, and export formatting. Components never reproduce financial arithmetic. Bounded integer IDR and basis-point percentages, BigInt intermediates, explicit conservative rounding. Round quoted price up before applying discount. Recompute fees/profit/margin after discount. Custom materials/waste, labor, and finishing are per unit; overhead/fixed selling fees are order-level. Service hours may use two decimal places. All inputs state their unit/scope.

## Work order and verification
1. Create project scripts, strict TS/ESLint/Vitest/Playwright config, feature-disabled environment template, ADRs. Install and verify package APIs against official references.
2. TDD engine: exact gross-margin examples, goods/service/custom costs, quantity, fixed/variable fees, waste only on material, rounding and discount, invalid/unsafe values and zero-revenue margin. Public contract in `src/lib/pricing/types.ts`.
3. In parallel with the builder, implement isolated landing/informational content and quotation export modules under explicitly separate file ownership. No shared file edits.
4. Create builder with preserved per-mode fields, progressive advanced settings, all adjacent validation errors, real-time result and margin guard. Accessible preview and clipboard fallback. Snapshot quote numbers/dates locally without third-party calls.
5. Persist bounded non-sensitive financial/form state per device; customer/business names and notes remain in memory by default, with explicit opt-in for local personal-detail persistence. Storage failure/corruption is non-blocking. Clear removes the app key and prevents immediate autosave resurrection until a new edit.
6. Subtle hero-only three-sheet parallax, <=24px motion, <=3deg rotation; mobile static/hidden and reduced-motion transforms disabled. Complete honest pricing/AI/FAQ/footer and draft legal routes.
7. Run typecheck, lint, unit/component tests, production build, Chromium desktop/mobile E2E, real PDF download parsing, clipboard/fallback, storage clear/reload/navigation, invalid inputs, accessibility scan, reduced motion, viewport overflow checks. Inspect screenshots and repair.
8. Update README, implementation status, decisions, and original checklist using real results only. Provide local preview URL and screenshot paths, limitations, and explicit next-phase boundaries.

## Acceptance
Guest completes quote creation, WhatsApp copying and real PDF export with matching figures, without auth or remote requests. All three mode calculations, fixed-point boundaries, discount guards, local draft controls, responsive layouts and reduced motion verified. Future integrations are explicitly not active. No commits or production deployments unless separately requested.
