# EOS Executive Dashboard

Full-stack dashboard for tracking Revenue, Collections, and Expenses (each split
Internal / External) across a Year → Business Unit → Member Company → Quarter
hierarchy, with role-based access for a Group Integrator (global admin) and
BU Integrators (scoped to their assigned Business Unit(s)).

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
npm run seed                # loads 2 years x 3 BUs x ~3-4 companies of demo data
npm run dev                 # starts the API on http://localhost:4000
```

Seeded login accounts (password for all: `password123`):

| Role | Email | Scope |
|---|---|---|
| Group Integrator | group.integrator@pgb.com | All Business Units |
| BU Integrator | bu.services@pgb.com | Professional Services |
| BU Integrator | bu.manufacturing@pgb.com | Manufacturing |
| BU Integrator | bu.tech@pgb.com | Technology |
| BU Integrator | bu.multi@pgb.com | Manufacturing + Technology |

## 3. Frontend

```bash
cd client
cp .env.example .env       # points to the API, defaults to http://localhost:4000/api
npm install
npm run dev                 # starts Vite on http://localhost:5173
```

Open http://localhost:5173 and log in with any account above.

## What's included

- **Schema** (`server/prisma/schema.prisma`): `User`, `BusinessUnit`,
  `UserBusinessUnit` (many-to-many BU assignment), `Company`, `Year`,
  `AnnualTarget`, `QuarterTarget`, `QuarterActual` — every financial model
  splits Revenue/Collections/Expenses into Internal/External columns, with
  compound-unique constraints (`companyId+yearId[+quarter]`) so aggregation
  queries stay correct and indexed.
- **API** (`server/src/routes`): JWT auth, CRUD for Years/BUs/Companies
  (Group Integrator only), target upserts (Group Integrator only), quarterly
  actuals + remarks upserts (BU Integrator, scoped to their assigned BUs), and
  a single `/api/dashboard` endpoint that aggregates company-level data up to
  BU or Group level on the fly (KPIs, chart series, target distribution
  matrix, operational grid).
- **RBAC**: `assertBusinessUnitAccess` / `scopedBusinessUnitFilter` in
  `server/src/middleware/auth.ts` enforce that a BU Integrator can never
  read or write data outside their assigned Business Unit(s), even if they
  manually pass another BU's id as a query parameter.
- **Frontend** (`client/src`): global Year/BU/Company/Quarter filter bar, KPI
  cards with green/red attainment coloring, a Recharts bar+line combo chart
  with an Internal/External breakdown toggle, the Target Distribution Matrix,
  the expandable Operational Grid with inline-editable Remarks, a dedicated
  Data Entry page for BU Integrators, and a Target Setup page (plus Year/BU/
  Company management) for the Group Integrator.
- **Seed script** (`server/prisma/seed.ts`): deterministic pseudo-random
  generator producing realistic quarterly figures with intentional
  over/under-target variance so the dashboard's attainment coloring and
  charts have something interesting to show immediately. The current year is
  only seeded through Q2 so you can try the Data Entry workflow for Q3/Q4.

## Note on this build

This codebase was written and statically reviewed (import resolution, Prisma
compound-key naming, RBAC coverage across every endpoint) but could not be
compiled or run end-to-end in the environment it was built in, because that
sandbox's network is locked to an allowlist that blocks the npm registry,
GitHub, and apt entirely — there was no way to `npm install` or stand up
Postgres there. Please run `npm install` in both `server/` and `client/` and
report back anything that doesn't build cleanly on your machine.
