# CLAUDE.md — Ghusn (غصن)

Project memory for Claude Code. Read this file fully, then `docs/README.md`, before any task.

## 1. What this project is

**غصن (Ghusn)** is a gift shop in Sudan: flowers, women's & men's perfumes, watches, cosmetics, teddy bears, women's clothing, شيلات (bridal shila) wrapping, gift wrapping — "anything giftable". Tagline: **هدايا تُصنع لتُذكر** ("Gifts made to be remembered").

We are building, in one codebase:
1. **Shop management system** (admin + POS): catalog, imports/shipments with landed cost, multi-currency, inventory, barcodes, POS, expenses, reports.
2. **Online store** at `ghusn.store` (Arabic + English, RTL/LTR).
3. Later: WhatsApp Cloud API integration, HR/payroll, partner ledgers, mobile apps (Expo).

**People**
- **Basil** — owner, funder, and the only developer. Lives in **Qatar**, the shop is in **Sudan**. Mechatronics engineer; comfortable with code but wants clear, production-grade guidance. Communicate with him in **Arabic** (technical terms may stay in English). Code, identifiers and commit messages in English.
- **His sisters** — business partners who run operations in Sudan (non-technical). UI for them must be simple, Arabic-first.

## 2. Source of truth

| File | Content |
|---|---|
| `docs/decisions.md` | **Approved decisions. Overrides everything else when in conflict.** |
| `docs/roadmap.md` | Phases, build order, current status, next task |
| `docs/currency-and-costing.md` | Multi-currency model, landed cost, pricing, profit (critical business logic) |
| `docs/customer-journey.md` | Order lifecycle, statuses, business rules, exceptions |
| `docs/brand-identity.md` | Colors, fonts, logo usage rules, asset list |
| `docs/system-design.md` | Original full design document (Arabic). Some infra details are superseded by `decisions.md` |
| `docs/glossary.md` | Arabic ↔ English domain terms and code names |
| `docs/backlog.md` | Approved ideas for later (do not build unless asked) |

If something is ambiguous or not covered, **ask Basil before inventing business rules**. Never silently change an approved decision; propose it and wait.

## 3. Stack (approved)

- **Monorepo:** Turborepo + pnpm workspaces. Node 22.
- **App:** Next.js (App Router, Route Handlers for REST `/api/v1`), React 19, TypeScript strict.
- **DB:** PostgreSQL 16 + **Prisma 6** (pinned; do not upgrade to Prisma 7 without discussing — config model changed).
- **Validation:** Zod at every API boundary.
- **Auth:** Better Auth, roles `OWNER` / `MANAGER` / `STAFF` (+ customers later, OTP via WhatsApp).
- **UI:** Tailwind CSS v4 + shadcn/ui, **RTL-first**, brand tokens in `apps/web/src/app/globals.css`.
- **Data fetching/tables:** TanStack Query / TanStack Table.
- **Jobs:** pg-boss (Postgres-backed queue).
- **Images:** Sharp → WebP, stored in Cloudflare R2.
- **i18n:** next-intl, locales `ar` (default, RTL) and `en` (LTR).
- **POS offline:** PWA + IndexedDB (Dexie) + sync queue (Phase 1, late).
- **Search:** Postgres full-text + `pg_trgm` with an Arabic-normalized column; Meilisearch only if needed later.
- **Testing:** Vitest (unit, especially money/stock logic), Playwright (e2e).
- **Infra:** single **Hostinger VPS** (KVM1 dev → KVM2 at launch), Ubuntu 24.04, Docker + **Coolify**, Postgres on the same VPS, Cloudflare (DNS/SSL/CDN/R2), daily DB backups to Backblaze B2, Sentry, Uptime Kuma. **No Supabase.**
- **Local dev on macOS:** OrbStack runs Postgres via `docker-compose.yml`.

## 4. Repository layout

```
apps/web            Next.js: storefront + admin + API (single app for now)
packages/db         Prisma schema, migrations, seed, exported client (@ghusn/db)
docs/               Project knowledge (see §2)
apps/web/public/brand   Approved logo/mark/pattern SVGs (never redraw the logo)
docker-compose.yml  Local Postgres
```
Planned later: `packages/ui` (shared components), `packages/core` (pure domain logic: money, pricing, landed cost), `apps/mobile` (Expo).

## 5. Commands

```bash
pnpm install
pnpm db:up          # start local Postgres (OrbStack/Docker must be running)
pnpm db:migrate     # prisma migrate dev (root .env loaded via dotenv-cli)
pnpm db:seed        # currencies, sample rates, wallets, 9 categories, owner user
pnpm db:studio
pnpm dev            # http://localhost:3000
pnpm build
```
Env lives in the **root** `.env` (copy from `.env.example`). Packages load it with `dotenv -e ../../.env`.

## 6. Non-negotiable engineering rules

### Money & currency (read `docs/currency-and-costing.md`)
1. **Base currency is USD** for cost, profit, partner capital and profit sharing. **Selling currency is SDG.** Purchases can be SDG, QAR, CNY, EGP, USD.
2. Every monetary record stores: `amount` (original), `currencyCode`, `rateUsed` (units per 1 USD at that moment), and `amountUsd` — **computed once at write time and never recomputed** from today's rate.
3. Money columns: `Decimal` / `NUMERIC(18,2)` (SDG may use 0 decimals for display); rates `NUMERIC(18,6)`. **Never use JS `number`/float for money math** — use a decimal library (e.g. `decimal.js`) in domain code.
4. Pricing uses **margin on selling price**, not markup: `priceUsd = landedCostUsd / (1 - targetMargin)`; `priceSdg = ceilTo(priceUsd × sdgPerUsd, step)` — always round **up**, step 500 below 50,000, 1,000 below 100,000, 5,000 from 100,000 (see `docs/currency-and-costing.md` §5).
5. Price changes are **suggested, never automatic**; a human approves; every change is written to `price_history`.
6. Landed cost per unit is fixed per **batch** (shipment). Extra shipment costs are allocated **by purchase value** (Phase 1 default); by weight is a Phase 2 option. COGS uses **weighted average cost in USD**.
7. Bankak orders lock their SDG price for the 24h reservation window.
8. All money/stock mutations happen inside **DB transactions**; stock can never go negative without an explicit override that is logged.

### Data & API
- Soft-delete business records (`deletedAt`), keep audit logs (who/when/what) for price, stock, money and order status changes.
- IDs: `cuid()`. Human-readable numbers for documents: `GHS-2026-000155` (orders), `SHP-2026-014` (shipments), `INV-…` (invoices).
- Validate input with Zod; return typed errors; never trust client-side totals — recompute on the server.
- Order status changes go through a single state-machine function (see `docs/customer-journey.md`).

### UI
- Arabic-first, `dir="rtl"`; use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) so LTR works for English.
- Brand tokens only (sage `#7D8A6E`, sand `#D1B790`, forest `#2F3B2C`, ivory `#F5F1E8`, gold `#B08D57`), plus functional UI tokens `line` and `danger` — no raw hex values in components. Fonts: IBM Plex Sans Arabic (UI), Amiri (Arabic headings), Cormorant Garamond (English headings).
- Use the SVG logos in `public/brand/` exactly as they are. **Do not modify, redraw, recolor outside the palette, or re-typeset the logo.** Respect minimum sizes (see brand doc): the full logo below 200px width → use `logo-ar-mark-*` (Arabic UI) or `logo-en-mark-*` (English UI) instead.
- Staff screens: big touch targets (≥44px), minimal fields, clear Arabic labels, works on phones.
- Numbers: Latin digits with thousands separators (`185,000 ج.س`), tabular numerals in tables.

### Workflow
- Work in small, reviewable steps. One feature per branch/PR. Conventional commits (`feat:`, `fix:`, `chore:`…).
- Before finishing a task: typecheck, lint, run tests, and make sure `pnpm build` passes.
- Add/extend tests for any money, stock, pricing or order-state logic.
- Update `docs/roadmap.md` (status) and `docs/decisions.md` (if a decision was made) at the end of a task.
- Explain to Basil in Arabic what changed and what he should verify, briefly.
- Never commit `.env` or secrets. Never run destructive DB commands (`migrate reset`, dropping data) without asking.
