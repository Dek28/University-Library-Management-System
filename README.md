# University Library Management System (ULMS)

A production-oriented library management system for a university: catalogue and
copy management, circulation, fines, an access-controlled digital repository,
inventory verification, student clearance, reading groups, reporting and a full
audit trail.

The API enforces every rule; the interface only decides what to show.

```
backend/    Node.js + Express + MongoDB REST API  (port 5000)
frontend/   React + Vite + Tailwind single-page app (port 5173)
docs/       Architecture and API notes
```

---

## Contents

- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Technology](#technology)
- [Configuration](#configuration)
- [Running the tests](#running-the-tests)
- [Project layout](#project-layout)
- [Architecture notes](#architecture-notes)
- [API documentation](#api-documentation)
- [Production build and deployment](#production-build-and-deployment)
- [Operational notes](#operational-notes)

---

## Quick start

**Prerequisites:** Node.js 18+, npm 9+, MongoDB 6+ running locally.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then edit the JWT secrets
npm run seed:fresh            # roles, settings, and demo data
npm run dev                   # http://localhost:5000

# 2. Frontend (second terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
```

Open <http://localhost:5173> and sign in.

### Development credentials

Created by `npm run seed:fresh`. The super administrator's password comes from
`SEED_ADMIN_PASSWORD` in `.env`; nothing is hardcoded.

| Role            | Sign in with                 | Password       |
| --------------- | ---------------------------- | -------------- |
| Super admin     | `admin@example.edu`          | `ChangeMe123!` |
| Administrator   | `grace.mollel@example.edu`   | `Password123!` |
| Librarian       | `mariam.juma@example.edu`    | `Password123!` |
| Academic staff  | `daniel.massawe@example.edu` | `Password123!` |
| Student         | `REG/2026/0001`              | `Password123!` |

> These exist for local development only. Change them before any real
> deployment; the server refuses to start in production with placeholder JWT
> secrets.

The seed also creates 16 titles with 56 copies, 45 members, active and overdue
loans, fines, a reservation queue, three reading groups and repository records:
enough for every dashboard and report to show real numbers immediately.

---

## What it does

**Catalogue.** Titles and physical copies are separate: *Fundamentals of
Nursing* is one catalogue record, and each shelvable item is a `ResourceCopy`
with its own accession number, barcode, shelf, condition and status.
Availability is always derived from real copies.

**Circulation.** Issue, return, renew, reserve and write off. Eligibility is
checked before anything is scanned and reports every blocker at once: role
limit, overdue items, unpaid fines, suspension. Returns calculate overdue days,
raise the right charges, route the copy to the shelf or to quarantine, and
promote the next member in the reservation queue.

**Fines.** Overdue charges accrue per day with a grace period and a policy cap.
Lost items are charged their replacement cost. Payments and waivers are ledger
entries; a waiver needs a written reason and is always audited against the
officer who approved it.

**Digital repository.** Theses, dissertations and reports with six access
levels. Files stream through an authorised endpoint and the storage location is
never exposed, so a guessed URL cannot bypass the access level. An item the
caller may not read answers exactly like one that does not exist.

**Clearance.** Obligations are re-evaluated at the moment of approval, not from
a stored snapshot. Granting clearance despite outstanding items requires an
explicit override, a reason of at least ten characters, and the
`clearance:override` permission.

**Reading groups.** Groups, members, scheduled sittings and attendance. A study
space cannot be double-booked: overlapping bookings are refused and the
conflicting group is named.

**Inventory.** Stock verification exercises compare what the catalogue expects
against what is on the shelf, then optionally apply the outcome, though never
to a copy that is out on loan.

**Reports.** Twenty-plus operational reports, each rendered as JSON, XLSX, CSV
or PDF from the same rows, so exports can never drift from what is on screen.

**Audit trail.** Append-only. Mongoose middleware rejects any update or delete,
so the guarantee is enforced by the model rather than by convention.

---

## Technology

| Layer      | Choices                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| Backend    | Node.js, Express 4, Mongoose 8, MongoDB                                  |
| Auth       | JWT access tokens, rotating opaque refresh tokens, bcrypt, RBAC          |
| Validation | Zod on both sides; the server validates every write regardless           |
| Security   | Helmet, CORS allow-list, rate limiting, NoSQL sanitisation, XSS cleaning |
| Reports    | ExcelJS (XLSX), PDFKit (PDF), built-in CSV                               |
| Frontend   | React 18, Vite, Tailwind, React Router, TanStack Query, Zustand          |
| Forms      | React Hook Form + Zod resolvers                                          |
| Charts     | Recharts                                                                 |
| Tests      | Jest + Supertest against a real MongoDB                                  |

---

## Configuration

Every setting is an environment variable; see `backend/.env.example` for the
annotated list. The ones that matter most:

| Variable                                 | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `MONGO_URI` / `MONGO_URI_TEST`           | Database connections (the test URI must contain `test`) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing. **Production refuses placeholder values.** |
| `JWT_ACCESS_EXPIRES_IN`                  | Access token lifetime (default `15m`)                |
| `CORS_ORIGINS`                           | Comma-separated allow-list                           |
| `COOKIE_SECURE`                          | Set `true` behind HTTPS                              |
| `STORAGE_DRIVER`                         | `local` today; see [file storage](#file-storage)     |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial super administrator                        |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Operational policy (borrowing limits, loan periods, renewal counts, fine rates,
grace periods, caps, reservation windows, opening hours) is **not** in the
environment. It lives in the database and is edited under **Settings**, so a
policy change takes effect on the next transaction without a deployment.

---

## Running the tests

The suite runs against a real MongoDB so indexes, aggregations and the
transaction fallback are exercised for real. It drops and rebuilds `ulms_test`
and never touches the development database.

```bash
cd backend
npm test
```

113 tests across 7 suites cover authentication and session rotation, the RBAC
matrix, the catalogue and copy rules, all the circulation workflows, fines,
clearance including the override path, reading-group scheduling conflicts, and
repository access control.

If MongoDB is not running the suite says so explicitly rather than failing
obscurely.

---

## Project layout

```
backend/src/
  config/        env, database connection, logger
  constants/     permission registry, enums
  models/        Mongoose schemas (+ shared plugins)
  services/      business logic, the only place rules live
  controllers/   thin HTTP adapters
  routes/v1/     versioned routing, permission-guarded
  middleware/    auth, validation, error handling, uploads, security
  validators/    Zod request schemas
  reports/       Excel/PDF builders and the report registry
  jobs/          scheduled maintenance
  docs/          OpenAPI specification
  seed/          development seed

frontend/src/
  api/           axios client and every endpoint
  components/    UI kit, tables, charts
  layouts/       dashboard shell and auth shell
  pages/         one folder per domain
  hooks/         list/query helpers
  store/         session state
  routes/        route table and permission guards
  validators/    Zod form schemas
```

---

## Architecture notes

### Authorization

Permissions are strings of the form `<domain>:<action>` (`loan:issue`,
`clearance:override`). Roles hold permission lists in the database and are
editable under **Roles & Permissions**. Every route declares what it needs; the
frontend hides what the account cannot do, and the API refuses it regardless.

An actor can never create or promote an account to a role at or above their own
authority level, and only a super administrator can mint another one.

### Sessions

Access tokens are short-lived JWTs. Refresh tokens are opaque random strings
stored only as SHA-256 hashes and rotated on every use. Presenting an
already-rotated token is treated as theft and revokes every session for that
account. Access tokens also carry the exact millisecond stamp of the account's
current password, so a token minted before a password change is rejected even if
both happened within the same second.

### Transactional consistency

Issuing and returning span several collections. They run inside a MongoDB
transaction where the deployment supports one (replica set or sharded cluster).

On a standalone `mongod`, the usual local setup, transactions are unavailable,
so the services fall back to ordered writes guarded by:

- a **conditional status claim** on the copy, so two simultaneous issues of the
  same copy cannot both succeed; and
- a **unique partial index** on `Loan.copy` for open loans, as the last line of
  defence.

To enable real transactions, run MongoDB as a single-node replica set:

```bash
mongod --replSet rs0 --dbpath <your-data-path>
mongosh --eval "rs.initiate()"
```

The API logs which mode it is in at startup.

### Data integrity

Transactional records are never hard-deleted. Catalogue records, members and
reference data use soft deletion (`isDeleted`/`deletedAt`/`deletedBy`); a copy
with loan history is *withdrawn* rather than removed so past transactions stay
resolvable. Reference data that is still pointed at cannot be deleted at all;
the API tells you what is using it and suggests deactivating instead.

### File storage

All file operations go through a small facade
(`services/storage/`). Swapping local disk for S3, Cloudinary or Azure Blob
means adding one driver module and changing `STORAGE_DRIVER`; no call site
changes. Repository documents are never served statically; only cover images
and the institution logo are.

### Notifications

`notification.service` writes in-app notifications and fans out to any
registered transport. Email, SMS or WhatsApp are added by registering a
transport; no caller changes. Nightly reminders use a dedupe key, so re-running
a job never double-notifies.

### Performance

Every list endpoint paginates server-side with a hard cap of 200 rows, uses
`lean()` queries with explicit field selection, and is backed by indexes,
including compound indexes for the common filters and text indexes for
catalogue and repository search. Dashboards are aggregated in MongoDB and
returned ready to render; the client never computes totals from raw records.

---

## API documentation

With the backend running:

- **Swagger UI**: <http://localhost:5000/api-docs>
- **Raw OpenAPI 3.0**: <http://localhost:5000/api-docs.json>

Every operation documents its required permission, parameters, request body,
responses and error cases. See also [`docs/API.md`](docs/API.md) for a narrative
overview and [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) for the schema.

Response envelopes are uniform:

```jsonc
// success
{ "success": true, "message": "…", "data": {}, "meta": { /* lists only */ } }

// failure
{ "success": false, "message": "Validation failed", "errors": [{ "field": "title", "message": "…" }] }
```

---

## Production build and deployment

```bash
# Frontend → static files in frontend/dist
cd frontend && npm run build

# Backend
cd backend && NODE_ENV=production npm start
```

Before going live:

1. Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (the server refuses
   to start otherwise).
2. Set `COOKIE_SECURE=true` and serve over HTTPS.
3. Set `CORS_ORIGINS` to your real front-end origin.
4. Run MongoDB as a replica set so circulation uses real transactions.
5. Run `npm run seed` (without `--fresh`) to create roles, settings and the
   super administrator only, with no demo data.
6. Change the seeded administrator password at first sign-in.
7. Serve `frontend/dist` from your web server or CDN and proxy `/api` to the
   backend.
8. Point `UPLOAD_DIR` at persistent storage, or switch `STORAGE_DRIVER` to a
   cloud driver.

Scheduled jobs (overdue marking, due reminders, reservation expiry) run in the
API process and can be disabled with `ENABLE_JOBS=false`, which is useful when
running several instances so only one performs maintenance. The application works
normally if they are off; nothing depends on them having run.

---

## Operational notes

**Barcodes.** Copy and membership barcodes are generated on creation, printable
from the interface, and scan straight into the circulation fields. A physical
scanner behaves as a keyboard, so no special handling is needed.

**Bulk import.** Students are imported from a spreadsheet; download the template
from the import screen. Rows are validated individually: a bad row is reported
with the reason and skipped, and the rest of the file still imports. A dry run
validates the whole file without writing anything.

**Time.** All timestamps are stored in UTC. The display timezone is configured
under Settings.

**Accessibility.** Labelled form controls, keyboard-navigable dialogs with focus
trapping and restoration, visible focus rings, semantic tables, status conveyed
by text as well as colour, and a skip link to the main content.

**Responsive.** Tables become stacked cards below the small breakpoint; the
sidebar collapses to a drawer. Wide content scrolls inside its own container
rather than the page.
