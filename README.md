# Mini ERP + CRM Operations Portal

An internal operations portal for a wholesale/distribution business — customer CRM, product and inventory management with a full audit ledger, and sales challans that keep stock honest under concurrent use.

Built with **Node.js · TypeScript · Express · PostgreSQL · Prisma · React (Vite)**.

---

## Table of contents

- [Live URLs and test credentials](#live-urls-and-test-credentials)
- [What is implemented](#what-is-implemented)
- [Architecture](#architecture)
- [The business rules that matter](#the-business-rules-that-matter)
- [Role permission matrix](#role-permission-matrix)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Deployment](#deployment)
- [Assumptions](#assumptions)
- [Known limitations](#known-limitations)

---

## Live URLs and test credentials

| What | URL |
| --- | --- |
| Frontend | _fill in after deploying_ |
| Backend API | _fill in after deploying_ |
| Health check | `<API>/health` |
| API index | `<API>/api/v1` |

All four demo accounts share the password **`Password@123`**:

| Role | Email | What they can do |
| --- | --- | --- |
| Admin | `admin@erpcrm.test` | Everything, including user management |
| Sales | `sales@erpcrm.test` | Customers, follow-ups, raise and confirm challans |
| Warehouse | `warehouse@erpcrm.test` | Products, stock movements, confirm/cancel challans |
| Accounts | `accounts@erpcrm.test` | Read-only across all modules, download invoices |

The login screen has one-click buttons for each of these, so no copy-pasting is needed to try a different role.

---

## What is implemented

**1 · Authentication and roles** — JWT bearer auth (12-hour expiry), bcrypt password hashing, four roles enforced per-route on the server and mirrored in the UI's navigation and route guards. Accounts can be deactivated; an admin cannot lock themselves out.

**2 · Customer CRM** — every field from the brief (name, mobile, email, business name, optional GST, type, address, status, follow-up date, notes), plus create/edit/delete, multi-field search, filters by status and type, sorting, pagination, a detail page, and an append-only follow-up timeline that can advance the customer's pipeline status in the same action.

**3 · Products and inventory** — full product master (name, SKU, category, unit price, current stock, minimum stock alert, location), low-stock filtering and dashboard alerts, and a complete **stock movement ledger** recording product, quantity, IN/OUT, reason, balance-after, who did it and when.

**4 · Sales challans** — pick a customer, add multiple product lines with quantity and an optional negotiated rate, auto-generated challan number, save as Draft or Confirmed, confirm/cancel transitions, and PDF export.

**Extras** — dashboard with live KPIs, Docker Compose for the whole stack, GitHub Actions CI that runs migrations and smoke-tests the API against a real Postgres, a Render blueprint, and a Postman collection with assertions.

---

## Architecture

```
erp-crm-portal/
├── server/                     Express + TypeScript REST API
│   ├── prisma/
│   │   ├── schema.prisma       Data model
│   │   └── seed.ts             Demo users + realistic sample data
│   └── src/
│       ├── config/env.ts       Zod-validated environment, fails fast at boot
│       ├── lib/                Prisma client, ApiError, pagination, doc numbering
│       ├── middleware/         authenticate, authorize, validate, error handler
│       ├── modules/            One folder per domain: routes → service → schema
│       ├── app.ts              Middleware chain and route mounting
│       └── server.ts           Listener + graceful shutdown
├── client/                     React + TypeScript (Vite)
│   └── src/
│       ├── lib/                axios instance, auth context, formatters, useList
│       ├── components/         Layout, shared UI primitives
│       └── pages/              One file per screen
├── postman/                    Importable collection with test assertions
├── .github/workflows/ci.yml    Typecheck, migrate, seed, build, smoke test
├── docker-compose.yml          Postgres + API + nginx-served client
└── render.yaml                 One-click deploy blueprint
```

### Request flow

```
Browser
  │  axios, Authorization: Bearer <jwt>
  ▼
helmet → cors → rate limit → JSON body parser
  ▼
authenticate  (verify JWT, attach req.user)
  ▼
authorize(...roles)  (403 if the role is not listed on the route)
  ▼
validate({ body, query, params })  (Zod parses AND replaces the raw input)
  ▼
route handler → service  (business rules + Prisma transactions)
  ▼
central error handler  →  { success: false, error: { code, message, details } }
```

**Layering.** Routes declare the HTTP contract and the permission list. Services own business rules and transactions — they never touch `req`/`res`, so they are directly unit-testable. Schemas are the single source of truth for input shape; `validate` replaces `req.body` with the parsed value, so handlers receive coerced, trimmed, typed data rather than raw strings.

**Response envelope.** Every response is `{ success, data, meta? }` or `{ success: false, error: { code, message, details? } }`. One shape means the client has exactly one place to unwrap and one place to render errors.

### Why Prisma

Type-safe queries generated from a single schema file, first-class transaction support, and a migration history that CI can replay against a clean database. Where Prisma's query API cannot express something — the column-to-column comparison `current_stock <= min_stock_alert`, and the conditional stock decrement — the code drops to parameterised raw SQL rather than working around it in application code.

---

## The business rules that matter

### Stock can never go negative — enforced in the database, not in JavaScript

The obvious implementation reads the stock, compares it, then writes the new value. Under two concurrent confirmations of the last unit in stock, both reads see `1`, both pass the check, and both write — stock ends at `-1`.

Instead, the decrement is a **single conditional UPDATE**:

```sql
UPDATE products
   SET current_stock = current_stock - $qty
 WHERE id = $id
   AND current_stock >= $qty
RETURNING current_stock
```

Postgres holds a row lock for the duration of the statement, so the second transaction re-evaluates the `WHERE` against the already-decremented value, matches zero rows, and is rejected with **422 `INSUFFICIENT_STOCK`** carrying `available` and `requested` in the error details.

Everything that moves stock funnels through one function — [`applyMovement`](server/src/modules/stock/stock.service.ts) — so there is exactly one code path to reason about, and it always writes the ledger row and the balance change in the same transaction.

### Challans store snapshots, not just foreign keys

A challan line copies the product's **name, SKU, category and unit price** at the moment it is written; the challan header copies the customer's **name, business name, mobile, GST and address**. Renaming a product or repricing it next month does not silently rewrite a document that was already printed and delivered. `productId` is kept alongside for reporting, but nothing displayed on the document depends on it.

### Draft vs Confirmed vs Cancelled

| Transition | Stock effect |
| --- | --- |
| Create as `DRAFT` | None — a draft is a working document |
| Create as `CONFIRMED` | Deducts immediately, inside the creation transaction |
| `DRAFT` → `CONFIRMED` | Deducts, writes OUT movements |
| `CONFIRMED` → `CANCELLED` | **Restores** stock, writes IN movements |
| `DRAFT` → `CANCELLED` | None |
| Editing a `CONFIRMED` challan | Refused (409) — cancel and reissue |

Cancellation reverses stock by writing new IN movements rather than deleting the original OUT rows, so the ledger stays a truthful record of what physically happened.

### Deadlock avoidance

A multi-line challan takes one row lock per product. Two challans sharing products in opposite order would deadlock, so lines are always processed **sorted by product id** — every transaction acquires locks in the same sequence.

### Challan numbers are race-safe

Numbers follow `CH-YYYYMM-0001`, generated from a `document_counters` row incremented inside the same transaction that creates the challan.

The implementation is a raw `INSERT … ON CONFLICT (key) DO UPDATE … RETURNING value` — one atomic statement. Two weaker approaches were tried and rejected:

- `SELECT max(number) + 1` hands two concurrent requests the same number.
- **Prisma's `upsert()` is also unsafe here.** It compiles to a SELECT followed by an INSERT or UPDATE, so concurrent transactions all read "no row", all attempt the INSERT, and everyone but the winner dies on the primary-key violation. This was not theoretical — it failed 7 of 8 requests in the concurrency test below, and once produced a duplicate challan number. The native upsert fixed it.

**Trade-off, stated honestly:** the counter lock is held until the surrounding transaction commits, so challan creation serialises on that row. That is the price of gap-free sequential numbering, which finance and audit want. A Postgres `SEQUENCE` would be lock-free but leaves gaps on rollback.

Because transactions can now queue on that lock, Prisma's default transaction limits (2s wait, 5s timeout) were too tight and surfaced as `P2028` errors under load. The challan transactions use 15s/30s, and all read-only work — customer lookup, product snapshot preparation — was moved **outside** the transaction so the lock is held for as little time as possible.

### Stock is only editable through the ledger

The product edit form has no stock field, and `PUT /products/:id` rejects `currentStock`. The only ways stock changes are a stock movement or a challan confirmation — both of which write a ledger row. This is why the on-hand number can always be explained.

---

## Role permission matrix

| Capability | Admin | Sales | Warehouse | Accounts |
| --- | :-: | :-: | :-: | :-: |
| View customers / products / stock / challans | ✅ | ✅ | ✅ | ✅ |
| Create & edit customers, add follow-ups | ✅ | ✅ | — | — |
| Delete customer | ✅ | — | — | — |
| Create & edit products | ✅ | — | ✅ | — |
| Record stock movements | ✅ | — | ✅ | — |
| Create & edit draft challans | ✅ | ✅ | — | — |
| Confirm / cancel challans | ✅ | ✅ | ✅ | — |
| Download challan PDF | ✅ | ✅ | ✅ | ✅ |
| Manage users | ✅ | — | — | — |

The API is the enforcement point. The UI hides what a role cannot do, but every route re-checks independently — hiding a button is a courtesy, not a security control.

---

## Running locally

### Prerequisites

- Node.js 20+ (developed on 22)
- A PostgreSQL 14+ database — local, Docker, or a free cloud one (Neon/Supabase/Render)

### Option A — Docker Compose (everything in one command)

```bash
docker compose up --build
docker compose exec api npm run seed     # once, to load demo data
```

Frontend on <http://localhost:5173>, API on <http://localhost:4000>.

### Option B — run the two apps directly

**1. Database.** Either start one with Docker:

```bash
docker run --name erp-crm-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=erp_crm -p 5432:5432 -d postgres:16-alpine
```

…or create a free database at [neon.tech](https://neon.tech) and copy its connection string.

**2. Backend.**

```bash
cd server
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate deploy     # create the schema
npm run seed                  # demo users + sample data
npm run dev                   # http://localhost:4000
```

**3. Frontend** (in a second terminal):

```bash
cd client
npm install
npm run dev                   # http://localhost:5173
```

No client `.env` is needed locally — Vite proxies `/api` to `localhost:4000`, so there is no CORS setup in development.

**4.** Open <http://localhost:5173> and click any demo role on the login screen.

### Verifying it works

```bash
curl http://localhost:4000/health
# {"status":"ok","database":"connected","timestamp":"..."}
```

**Run the full smoke test** — 57 assertions covering every module:

```bash
bash scripts/smoke-test.sh
```

```
== 9. Concurrency: 8 simultaneous confirms of limited stock ==
  (8 concurrent confirms of 1 unit each, only 3 in stock)
  PASS  exactly 3 succeeded  ->  3
  PASS  final stock is 0, never negative  ->  0
==================================================
  PASSED: 57      FAILED: 0
==================================================
```

It covers all four role logins, the full RBAC matrix (403s for every disallowed combination), validation shapes, pagination and search, the customer follow-up flow, ledger balance arithmetic, the complete challan lifecycle including confirm/cancel stock round-trips, insufficient-stock rejection with rollback, PDF export, and the concurrency guarantee. Fixtures are randomised per run, so it is safe to run repeatedly against the same database. It also runs against a deployed instance:

```bash
API=https://your-api.onrender.com/api/v1 bash scripts/smoke-test.sh
```

Alternatively import `postman/ERP-CRM-Portal.postman_collection.json`, run **Auth → Login (Admin)** (the token is captured automatically), then run any other folder.

### A 60-second tour of the interesting parts

1. Log in as **Sales** → **Sales Challans** → **New challan**.
2. Pick a customer, add a product, set a quantity **larger than the stock shown**, and press **Save & confirm**. The API refuses it with a specific message naming the product and the available quantity.
3. Lower the quantity and confirm. Go to **Stock Ledger** — the OUT movement is there with the challan number as its reason and the resulting balance.
4. Open the challan → **Cancel challan**. The stock comes back as an IN movement; the original OUT row is still there.
5. Log in as **Accounts** and note that the write buttons are gone — and that calling those endpoints directly returns 403.

---

## Environment variables

Nothing secret is committed. `server/.env` and `client/.env` are git-ignored; `.env.example` files document every variable and are committed.

### Server (`server/.env`)

| Variable | Required | Default | Notes |
| --- | :-: | --- | --- |
| `NODE_ENV` | — | `development` | `development` \| `test` \| `production` |
| `PORT` | — | `4000` | Hosting platforms usually inject this |
| `DATABASE_URL` | ✅ | — | Postgres connection string; add `?sslmode=require` for Neon |
| `JWT_SECRET` | ✅ | — | Min 16 chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | — | `12h` | One working day |
| `CORS_ORIGIN` | — | `*` | Comma-separated origins. **Set to the real frontend origin in production** |
| `RATE_LIMIT_WINDOW_MINUTES` | — | `15` | |
| `RATE_LIMIT_MAX` | — | `500` | Requests per window per IP |
| `SEED_DEFAULT_PASSWORD` | — | `Password@123` | Password for every seeded demo user |

Validation happens once at boot in `src/config/env.ts` using Zod. A missing or malformed variable **exits the process with a readable message** rather than surfacing as a confusing runtime error on the first request that needs it.

### Client (`client/.env`)

| Variable | Notes |
| --- | --- |
| `VITE_API_URL` | Leave empty locally (the dev proxy handles it). Set to the deployed API origin for production builds, no trailing slash. |

⚠️ Vite inlines `VITE_*` at **build** time. Changing it on the host requires a rebuild, not just a restart.

---

## API reference

Base URL: `<host>/api/v1` · all responses JSON · all routes except `/auth/login` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | Returns `{ token, user }` |
| GET | `/auth/me` | any | Current user profile |
| POST | `/auth/register` | Admin | Create a portal user |
| POST | `/auth/change-password` | any | Change own password |

### Customers

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/customers` | any | `?page&limit&search&status&type&dueFollowUps&sortBy&sortOrder` |
| GET | `/customers/:id` | any | Detail + follow-up timeline + recent challans |
| POST | `/customers` | Admin, Sales | Create |
| PUT | `/customers/:id` | Admin, Sales | Update |
| DELETE | `/customers/:id` | Admin | Refused if the customer has challans |
| GET | `/customers/:id/follow-ups` | any | Timeline |
| POST | `/customers/:id/follow-ups` | Admin, Sales | Add note, optionally set next date and status |

Search matches name, mobile, email, business name and GST number.

### Products

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/products` | any | `?page&limit&search&category&location&lowStock&isActive&sortBy&sortOrder` |
| GET | `/products/categories` | any | Distinct category list |
| GET | `/products/:id` | any | Detail + last 20 movements |
| POST | `/products` | Admin, Warehouse | Opening stock is logged as an IN movement |
| PUT | `/products/:id` | Admin, Warehouse | Cannot change stock — use the ledger |
| DELETE | `/products/:id` | Admin | Refused if used on any challan |

### Stock

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/stock/movements` | any | `?page&limit&productId&type&search&from&to` |
| POST | `/stock/movements` | Admin, Warehouse | `{ productId, quantity, type, reason }` |

### Challans

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/challans` | any | `?page&limit&search&status&customerId&from&to&sortBy&sortOrder` |
| GET | `/challans/:id` | any | Full challan with snapshotted lines |
| GET | `/challans/:id/pdf` | any | Streams a PDF |
| POST | `/challans` | Admin, Sales | `{ customerId, items[], status, notes }` |
| PUT | `/challans/:id` | Admin, Sales | Drafts only |
| POST | `/challans/:id/confirm` | Admin, Sales, Warehouse | Deducts stock |
| POST | `/challans/:id/cancel` | Admin, Sales, Warehouse | `{ reason }`; restores stock if confirmed |
| DELETE | `/challans/:id` | Admin | Drafts only |

### Dashboard & users

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/dashboard/summary` | any |
| GET | `/users` | Admin |
| PATCH | `/users/:id` | Admin |

### Status codes

| Code | Meaning |
| --- | --- |
| `200` / `201` | Success |
| `400 BAD_REQUEST` | Validation failed — `details[]` lists field and message |
| `401 UNAUTHORIZED` | Missing, malformed, invalid or expired token |
| `403 FORBIDDEN` | Authenticated, but the role is not allowed |
| `404 NOT_FOUND` | No such record or route |
| `409 CONFLICT` | Duplicate SKU/mobile/email, or an illegal state transition |
| `422 INSUFFICIENT_STOCK` | Business rule violated — includes `available` vs `requested` |
| `429 RATE_LIMITED` | Too many requests |
| `500` | Unexpected — logged server-side, never leaks internals in production |

**Error shape:**

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for Dish Wash Bar 300g (DISH-BAR-300G). Available: 18, requested: 50.",
    "details": { "productId": "…", "sku": "DISH-BAR-300G", "available": 18, "requested": 50 }
  }
}
```

**Paginated shape:**

```json
{
  "success": true,
  "data": [ … ],
  "meta": { "page": 1, "limit": 10, "total": 47, "totalPages": 5, "hasNextPage": true, "hasPrevPage": false }
}
```

---

## Deployment

Full step-by-step instructions, including the server setup and the exact environment variables to paste, are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. In summary:

| Piece | Platform | How |
| --- | --- | --- |
| Database | Neon (free Postgres) | Create project, copy the pooled connection string |
| API | Render web service | Root `server`, build `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`, start `node dist/server.js`, health check `/health` |
| Frontend | Vercel | Root `client`, build `npm run build`, output `dist`, set `VITE_API_URL` |

The repo also contains `render.yaml`, which provisions the database, API and static site in one Blueprint apply.

**After the first deploy:** set `CORS_ORIGIN` on the API to the frontend's origin, set `VITE_API_URL` on the frontend to the API's origin and redeploy it, then run the seed once from the API service shell (`npm run seed`).

### CI/CD

`.github/workflows/ci.yml` runs on every push and PR: it boots a real Postgres service container, applies migrations, seeds, typechecks, builds, then **boots the API and smoke-tests `/health` plus an authenticated request**. Render and Vercel both auto-deploy from `main`.

---

## Assumptions

These were not specified in the brief; each is a deliberate decision:

1. **Internal portal, no public sign-up.** Users are created by an admin. There is no password-reset email flow because there is no mail infrastructure in scope.
2. **Stateless JWT, no refresh tokens.** A 12-hour expiry covers a working day. Refresh-token rotation is the right answer for a production system but adds a session store this brief does not call for.
3. **Cancelling a confirmed challan restores stock.** The brief does not say. Restoring is the safer default for a physical warehouse — goods that were never dispatched are still on the shelf — and it is reversed via new IN movements so the ledger records both events.
4. **Drafts reserve nothing.** Only confirmation moves stock, so two drafts can be raised for the same last unit; whichever confirms first wins and the second gets a clear 422. Soft reservations were considered out of scope.
5. **A product cannot appear twice on one challan.** Rejected at validation with a message asking the user to combine the quantities — this prevents ambiguous partial-line edits.
6. **Mobile number is the customer's practical business key.** Duplicates are refused with 409 and the existing customer's id, rather than silently creating a second record for the same person. It is not a hard DB constraint, so it can be relaxed.
7. **Prices are Indian Rupees**, stored as `DECIMAL(12,2)` / `DECIMAL(14,2)`. Never floats — binary floating point cannot represent money exactly.
8. **No tax computation.** A challan is a delivery document, not a tax invoice. GST is captured and printed but not calculated; that needs HSN codes and CGST/SGST/IGST logic beyond this scope.
9. **Purchase orders and invoices are out of scope.** The brief mentions them in the business context but defines no module for either; invoice PDF export is delivered as the listed bonus instead.
10. **Delete is restricted where history exists.** Customers with challans and products used on challans cannot be deleted — deactivate instead. Referential history matters more than tidiness in an ERP.
11. **GST and mobile validation use Indian formats** (15-character GSTIN, 10-digit mobile starting 6–9), matching the domain.

---

## Known limitations

Stated plainly rather than hidden:

1. **No unit test suite.** There is a 57-assertion end-to-end smoke test (`scripts/smoke-test.sh`) that CI runs against a real Postgres, and it caught two genuine concurrency bugs during development. But there are no isolated unit tests. Given the 48-hour window I chose the black-box suite because it exercises the transactional behaviour that actually matters — that is precisely what a mocked unit test would have missed. The services are pure functions of `(tx, input)` and were written to be testable; `applyMovement` and the challan state machine are where I would start with Vitest + Testcontainers.
2. **Purchase orders and goods receipts are not modelled.** Inbound stock is recorded as a manual IN movement with a free-text reason instead of being tied to a PO document.
3. **No tax/GST calculation** — see assumption 8.
4. **The challan builder loads up to 100 customers and 100 products** into its dropdowns. Fine for this dataset; a real catalogue needs a server-side typeahead.
5. **No file uploads.** Product images to S3 were listed as a bonus and are not implemented — it would need AWS credentials and a bucket, which the brief says not to spend money on.
6. **No soft deletes or per-field audit trail.** Stock has a full ledger, but edits to customers and products overwrite in place; only `updatedAt` records that something changed.
7. **Render's free tier sleeps after ~15 minutes of inactivity**, so the first request after a pause takes 30–60 seconds to wake the service. Subsequent requests are fast.
8. **The dashboard summary runs ~13 queries per request.** Correct and fast at this data volume, but it should become a materialised view or a cached aggregate before it grows.
9. **Rate limiting is per-instance, in memory.** Multiple instances would each keep their own counter; a shared Redis store would be needed to scale horizontally.
10. **Client-side stock checks in the challan builder are a convenience only.** They can go stale between page load and submit — the server's transactional check is the authority, and the UI surfaces its error.

---

## Licence

Written as a technical case study submission.
