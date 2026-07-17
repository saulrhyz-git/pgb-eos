# EOS Executive Dashboard

Full-stack dashboard with two views: **Revenue** (Revenue, Collections, and
Expenses — each split Internal / External, in Philippine Peso — across a
Year → Business Unit → Member Company → Quarter hierarchy) and **Rocks**
(EOS-style 90-day priorities tracked per Company/Year/Quarter, tagged against
a shared Goals taxonomy). Role-based access is provided for a Superadmin
(full system access), a Group Integrator (global by default, but can
optionally be scoped to one or more assigned Business Units), and BU
Integrators (always tied to at least one assigned Business Unit, with data
entry, target-setup, and Rock-tracking rights scoped to it).

**Stack:** React (Vite) + Tailwind + Recharts + Lucide on the front end;
Express + TypeScript + Prisma + PostgreSQL on the back end.

## Prerequisites

- Node.js 18+
- PostgreSQL installed and running locally

## 1. Database setup

Create a database and a role for the app (adjust names/password as you like —
just keep them in sync with `server/.env`):

```bash
psql postgres -c "CREATE USER eos_user WITH PASSWORD 'eos_password';"
psql postgres -c "CREATE DATABASE eos_dashboard OWNER eos_user;"
```

## 2. Backend

```bash
cd server
cp .env.example .env      # edit DATABASE_URL / JWT_SECRET if needed
npm install
npm run prisma:generate
npm run prisma:migrate     # creates all tables from prisma/schema.prisma
npm run seed                # creates only the superadmin account, no sample data
npm run dev                 # starts the API on http://localhost:4000
```

The seed script creates a single account and nothing else — no sample Business
Units, Companies, Years, targets, or actuals:

| Role | Username | Password | Scope |
|---|---|---|---|
| Superadmin | `saulrhyz` | `0811837Sey@me7` (must be changed on first login) | Full system access |

The login form accepts either an email address or a username in the same field.

## 3. Frontend

```bash
cd client
cp .env.example .env       # points to the API, defaults to http://localhost:4000/api
npm install
npm run dev                 # starts Vite on http://localhost:5173
```

Open http://localhost:5173 and log in as the superadmin above. You'll be
required to set a new password immediately, then use Admin → Business Units /
Companies / Users (and Target Setup → Add Year) to populate the system with
real data — the app starts completely empty.

## What's included

- **Schema** (`server/prisma/schema.prisma`): `User` (now with `username`,
  `mustChangePassword`), `BusinessUnit`, `UserBusinessUnit` (many-to-many BU
  assignment), `Company`, `Year`, `AnnualTarget`, `QuarterTarget`,
  `QuarterActual`, `SmtpSettings` (singleton row), `Goal`, and `Rock` — every
  financial model splits Revenue/Collections/Expenses into Internal/External
  columns, with compound-unique constraints (`companyId+yearId[+quarter]`) so
  aggregation queries stay correct and indexed. A `Rock` belongs to a
  Company + Year + Quarter, optionally tags a `Goal`, and carries `status`
  (`PENDING` / `ON_TRACK` / `AT_RISK` / `TARGET_MET`) and `progressPct`
  (0-100) that get updated over time like a project tracker.
- **Roles**:
  - `SUPERADMIN` — always global. Full system access, including user/company/BU
    management and SMTP settings.
  - `GROUP_INTEGRATOR` — global by default (sees/manages every Business Unit).
    An admin can optionally assign one or more specific Business Units to a
    Group Integrator via Admin → Users, which narrows that account's scope to
    just those BUs instead of everything. Can still create Years/BUs/Companies
    and set targets (within their scope).
  - `BU_INTEGRATOR` — always scoped, and always required to have at least one
    assigned Business Unit (enforced on both create and edit in
    `server/src/routes/admin.ts`). Can do data entry (quarterly actuals),
    target setup (Annual/Quarter targets), and add/update Rocks for companies
    within their assigned Business Unit(s), but cannot create new
    Years/BUs/Companies or manage the Goals taxonomy.
- **API** (`server/src/routes`): JWT auth (login accepts email or username),
  a `POST /api/auth/change-password` flow that's enforced whenever a user's
  `mustChangePassword` flag is set (e.g. the seeded superadmin's first
  login, or any account an admin resets), CRUD for Years/BUs/Companies
  (Group Integrator or Superadmin), target upserts (Group Integrator,
  Superadmin, or a BU Integrator scoped to their own Business Unit(s)),
  quarterly actuals + remarks upserts (BU Integrator, scoped to their
  assigned BUs), a superadmin-only `server/src/routes/admin.ts` with full
  CRUD over Users/Companies/Business Units, a superadmin-only
  `server/src/routes/settings.ts` for SMTP configuration + test-send
  (via `nodemailer`), `server/src/routes/goals.ts` (Goal CRUD — read is open
  to everyone, write is Group Integrator + Superadmin, deliberately *not*
  folded into the superadmin-only admin router since Group Integrators need
  it too), `server/src/routes/rocks.ts` (Rock CRUD, BU-scoped the same way as
  actuals/targets), and a single `/api/dashboard` endpoint that aggregates
  company-level data up to BU or Group level on the fly (KPIs, chart series,
  target distribution matrix, operational grid).
- **RBAC**: `assertBusinessUnitAccess` / `scopedBusinessUnitFilter` in
  `server/src/middleware/auth.ts` enforce that a scoped user (a BU Integrator,
  or a Group Integrator that's been assigned specific BUs) can never read or
  write data outside their assigned Business Unit(s), even if they manually
  pass another BU's id as a query parameter. `hasGlobalBusinessUnitAccess`
  centralizes who counts as global (Superadmins always; Group Integrators only
  when they have zero BU assignments). `blockPendingPasswordChange` locks
  every authenticated route except the auth routes themselves until a flagged
  user sets a new password.
- **Frontend** (`client/src`): a **Revenue** page (`pages/Dashboard.tsx`,
  renamed in the nav from "Dashboard") with the global Year/BU/Company/Quarter
  filter bar, KPI cards with green/red attainment coloring, a Recharts
  bar+line combo chart with an Internal/External breakdown toggle, the Target
  Distribution Matrix, and the expandable Operational Grid with
  inline-editable Remarks; a **Rocks** page (`pages/Rocks.tsx`) with its own
  Year/Quarter/BU/Company/Goal filter bar, five summary cards (Total Rocks,
  Target Met, On Track, At Risk / Pending, Avg Progress %) computed
  client-side from the filtered list, a Goals quick-manage panel (Group
  Integrator/Superadmin only), an Add/Edit Rock form, and a table with
  inline status + progress editing plus delete, project-tracker style; a
  Data Entry page and a Target Setup page open to all three roles (each
  scoped server-side; the Add Year/BU/Company quick-add forms on Target Setup
  are only shown to Group Integrators/Superadmin), a forced Change Password
  screen, and a Superadmin-only `/admin` section (`client/src/pages/admin`)
  with tabs for Users (including the Business Unit assignment checklist),
  Companies, Business Units, and SMTP Settings.

- **Seed script** (`server/prisma/seed.ts`): a hard reset, not a passive
  seed. Every time you run `npm run seed` it wipes all Business Units,
  Companies, Years, targets, actuals, Rocks, Goals, and any non-superadmin
  users, then ensures the superadmin account exists. This is what to run if
  sample/demo data from an earlier version of this project is still showing
  up in your database — re-run `npm run seed` and it will be removed. SMTP
  settings are left untouched.
- **Currency**: all figures are formatted as Philippine Peso (₱) via
  `client/src/utils/format.ts` (`Intl.NumberFormat("en-PH", { currency: "PHP" })`).

## SMTP / email notifications

Log in as the superadmin and go to Admin -> SMTP Settings to configure the
outbound mail server (host, port, TLS, credentials, from address/name) and
send a test email. Settings are stored in the `SmtpSettings` table; no
notifications are auto-triggered yet, this wires up the configuration and
test-send capability for future use.

## Note on this build

This codebase was written and statically reviewed (import resolution, Prisma
compound-key naming, RBAC coverage across every endpoint) but could not be
compiled or run end-to-end in the environment it was built in, because that
sandbox's network is locked to an allowlist that blocks the npm registry,
GitHub, and apt entirely — there was no way to `npm install` or stand up
Postgres there. Please run `npm install` in both `server/` and `client/` and
report back anything that doesn't build cleanly on your machine.

The superadmin/admin-panel/SMTP-settings additions (new `SUPERADMIN` role,
`mustChangePassword` flow, `server/src/routes/admin.ts`, `server/src/routes/settings.ts`,
`nodemailer` dependency, and the `client/src/pages/admin` section) were built
under the same constraint and have not been runtime-tested either. After
`npm install`, run `npm run prisma:migrate` (this is the project's first
migration — no `migrations/` folder exists yet, so it will generate one
initial migration containing the full schema including these additions) and
`npm run seed`, then verify: logging in as `saulrhyz` forces the password
change screen, the resulting `/admin` section loads and its CRUD actions
work, and a test SMTP send either succeeds or fails with a sensible message.

The RBAC rework (BU Integrator required-BU-assignment validation, BU
Integrator access to Target Setup, and optional Business Unit scoping for
Group Integrators) is likewise unverified end-to-end. Worth checking by hand:
creating a BU Integrator with no Business Unit selected is rejected; a BU
Integrator can log in and both submit quarterly actuals and save Annual/
Quarter targets, but only for companies in their assigned BU(s) (and the
Add Year/BU/Company forms are hidden for them); a Group Integrator with no
Business Units assigned still sees everything; assigning specific Business
Units to a Group Integrator narrows what they see on the Dashboard, Target
Setup, and Data Entry pages to just those BUs.

The Rocks feature (`Goal`/`Rock` schema additions, `server/src/routes/goals.ts`,
`server/src/routes/rocks.ts`, and `client/src/pages/Rocks.tsx`) is also
unverified end-to-end — it needs a fresh `npm run prisma:migrate` to pick up
the new tables. Worth checking by hand: a Group Integrator/Superadmin can add
and delete Goals but a BU Integrator can't; a BU Integrator can add a Rock
only for companies in their own BU(s), and the summary cards (Total Rocks /
Target Met / On Track / At Risk-Pending / Avg Progress) update correctly as
you change status and progress inline in the table; filtering by Year,
Quarter, Business Unit, Company, and Goal all narrow the list correctly.
