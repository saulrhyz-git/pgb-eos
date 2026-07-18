# EOS Executive Dashboard

Full-stack dashboard with two views: **Revenue** (Revenue, Collections, and
Expenses — each split Internal / External, in Philippine Peso, each with its
own Remarks field — across a Year → Business Unit → Member Company → Quarter
hierarchy; Annual and Quarter **targets, like actuals, are set once per
Company** — a Business Unit's target is never entered directly, it's a
rollup computed by summing every Company's target within that BU) and
**Rocks** (EOS-style 90-day priorities tracked per
Company/Year/Quarter, each with its own Remarks field, tagged against a
shared Business Goals taxonomy that Superadmin/Group Integrator can assign
to one or more Business Units, or leave global). Role-based access is
provided for a Superadmin
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
  assignment), `Company` (with an optional free-text `description` field, set
  on create and editable afterward), `Year`, `QuarterTarget`,
  `QuarterActual`, `SmtpSettings` (singleton row), `BusinessGoal`,
  `BusinessGoalBusinessUnit` (many-to-many BU assignment for goals), and
  `Rock`. **`QuarterTarget` and `QuarterActual` both belong to a `Company`**
  (`@@unique([companyId, yearId, quarter])` on each) — targets and actuals are
  entered at exactly the same granularity. There is no `AnnualTarget` table:
  Annual Target is never separately entered or stored, it's always derived by
  summing a Company's Q1-Q4 `QuarterTarget` rows on the fly in
  `server/src/routes/dashboard.ts`. A Business Unit's target/actual is
  likewise never stored directly; it's a rollup computed the same way, by
  summing every Company's numbers within that BU. Every financial model splits Revenue/Collections/Expenses into
  Internal/External columns. `QuarterActual` carries three independent
  remarks fields —
  `revenueRemarks`, `collectionsRemarks`, `expensesRemarks` — instead of one
  shared remarks field. A `Rock` belongs to a Company + Year + Quarter,
  optionally tags a `BusinessGoal`, has its own `remarks` field, and carries
  `status` (`PENDING` / `ON_TRACK` / `AT_RISK` / `TARGET_MET`) and
  `progressPct` (0-100) that get updated over time like a project tracker. A
  `BusinessGoal` with no `BusinessGoalBusinessUnit` rows is global (usable by
  any Rock); assigning it to specific Business Units narrows which Rocks can
  tag it, mirroring the same opt-in scoping pattern used for Group
  Integrators.
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
    target setup (Quarter targets, which roll up into a computed Annual
    Target), and add/update Rocks for companies within their assigned
    Business Unit(s), but cannot create new Years/BUs/Companies or manage
    the Goals taxonomy.
- **API** (`server/src/routes`): JWT auth (login accepts email or username),
  a `POST /api/auth/change-password` flow that's enforced whenever a user's
  `mustChangePassword` flag is set (e.g. the seeded superadmin's first
  login, or any account an admin resets), CRUD for Years/BUs/Companies
  (Group Integrator or Superadmin), `server/src/routes/targets.ts` (Quarter
  target upserts keyed by `companyId` + `yearId` + `quarter` — Group
  Integrator, Superadmin, or a BU Integrator scoped to their own Business
  Unit(s), mirroring how actuals are scoped; there is no Annual Target
  endpoint — Annual Target is read-only and derived, never written to
  directly), `server/src/routes/actuals.ts`
  (quarterly actuals + per-category remarks upserts keyed by `companyId` +
  `yearId` + `quarter`, BU Integrator scoped to their assigned BUs), a
  superadmin-only `server/src/routes/admin.ts` with full CRUD over
  Users/Companies/Business Units, a superadmin-only
  `server/src/routes/settings.ts` for SMTP configuration + test-send (via
  `nodemailer`), `server/src/routes/businessGoals.ts` (Business Goal CRUD —
  read is open to everyone, write is Group Integrator + Superadmin,
  deliberately *not* folded into the superadmin-only admin router since
  Group Integrators need it too; create/update validate any submitted
  `businessUnitIds` against the caller's own BU access before assigning
  them), `server/src/routes/rocks.ts` (Rock CRUD, BU-scoped the same way as
  actuals/targets, plus `assertBusinessGoalUsable` which rejects tagging a
  Rock with a Business Goal that's scoped to a different Business Unit than
  the Rock's company; also `POST /rocks/rollover`, Group Integrator/
  Superadmin only, which finds every non-`TARGET_MET` Rock in the given
  Year/Quarter/BU/Company/Business Goal scope and creates a copy of each one
  in the next quarter — Q4 rolls into Q1 of the following Year, which must
  already exist, otherwise it 400s asking the admin to create that Year
  first; the original Rocks are left untouched, so this carries a copy
  forward rather than moving them), and a single `/api/dashboard` endpoint that fetches
  targets and actuals per Company, then aggregates both up to whatever scope
  (BU, Group, or a single-Company drill-down) the request asks for (KPIs,
  chart series, per-BU target distribution matrix computed by summing each
  BU's Companies' targets, per-BU operational grid with nested per-Company
  actuals).
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
  filter bar (Quarter includes an "All Quarters" option — sends `quarter=all`
  to the API — which turns the "Q_ Target/Actual" KPIs and the Operational
  Grid's "Q_ Target/Actual" columns into full-year sums instead of a single
  quarter's figures; per-quarter Remarks are hidden in that mode since a
  remark belongs to one specific quarter), color-coded KPI cards in three
  rows so a category can be matched at a glance (Revenue = blue, Collections
  = emerald, Expenses = amber) — row 1 is Annual Revenue/Collections/Expenses
  Target (each a straight sum of every in-scope Company's Q1-Q4 Quarter
  Target, split by category, and unaffected by the Quarter filter — there's
  nothing to separately enter here), row 2 is the same three categories for
  just the selected period ("Q_ Revenue/Collections/Expenses Target", or the
  full year in "All Quarters" mode — these DO change with the Quarter
  filter), row 3 is the selected-period Actual (with attainment %) and
  Year-to-Date Actual — all in ₱ via `Intl.NumberFormat("en-PH", { currency:
  "PHP" })` — with green/red attainment coloring, a Recharts bar+line combo
  chart (Actual as blue bars, Target as an orange line; the Internal/External
  toggle uses a solid orange line for Internal and a dashed magenta line for
  External so the two target lines stay visually distinct from each other)
  with an Internal/External breakdown toggle, a Target Distribution Matrix
  with three color-coded rows per Business Unit — Revenue/Collections/
  Expenses, same blue/emerald/amber convention as the KPI cards — each with
  Q1-Q4 target columns plus an Annual Target column that's always their sum,
  computed by summing that BU's Companies' own Quarter Targets, and an
  Operational Grid where each row is
  a Business Unit (target vs its Companies' combined actual, attainment %,
  YTD) expandable to show every contributing Company's own actuals plus
  three independently inline-editable Remarks fields
  (Revenue/Collections/Expenses); `pages/TargetConfig.tsx` ("Target Setup"
  in the nav) sets Quarter targets by Year + Quarter + Business Unit +
  **Company** — exactly the same Company-level granularity as
  Data Entry/actuals — and that Company's quarter target rolls up into its
  Business Unit's total shown on the Revenue dashboard. There's no Annual
  Target entry here (or anywhere) — it's always derived by summing a
  Company's own Q1-Q4 Quarter Targets, shown read-only on the Revenue
  dashboard. Each of Revenue/Collections/Expenses has its own "One Total" vs
  "Internal / External" toggle there — Internal + External is always the
  figure that counts, so "One Total" is purely a data-entry shortcut that
  puts the whole number in Internal and zeroes External; no schema or API
  change was needed for it; a **Rocks** page (`pages/Rocks.tsx`) with
  its own Year/Quarter/BU/Company/Business Goal filter bar, a Rollover
  button (Group Integrator/Superadmin only, enabled only when a specific
  Quarter — not "All Quarters" — is selected) that carries every
  not-yet-`TARGET_MET` Rock in the current filter scope forward into the
  next quarter, with a confirmation prompt naming the from/to quarter before
  it runs, five summary cards (Total Rocks, Target Met, On Track, At Risk /
  Pending, Avg Progress %) computed client-side from the filtered list, a "Manage
  Business Goals" panel (Group Integrator/Superadmin only) with a
  Business-Unit-checklist per goal for assigning it to one or more BUs (or
  leaving it unassigned/global), an Add/Edit Rock form with its own Remarks
  field, and a table with inline status + progress editing plus delete,
  project-tracker style; a Data Entry page and a Target Setup page open to
  all three roles (each scoped server-side; the Add Year/BU/Company
  quick-add forms on Target Setup are only shown to Group
  Integrators/Superadmin), a forced Change Password screen, and a
  Superadmin-only `/admin` section (`client/src/pages/admin`) with tabs for
  Users (including the Business Unit assignment checklist), Companies,
  Business Units, and SMTP Settings.

- **Seed script** (`server/prisma/seed.ts`): a hard reset, not a passive
  seed. Every time you run `npm run seed` it wipes all Business Units,
  Companies, Years, targets, actuals, Rocks, Business Goals, and any
  non-superadmin users, then ensures the superadmin account exists. This is
  what to run if
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

## Troubleshooting

**Dashboard is stuck on "Loading dashboard..." after login, nothing renders,
no error message.** This means the `/api/dashboard` request never got a
response at all (check your browser's Network tab: the request will show as
still "pending"/stuck rather than a completed request with a status code).
The near-certain cause is that the backend threw an error while querying the
database — most commonly because `server/prisma/schema.prisma` has changed
since you last ran migrations (e.g. a new field/table was added in a recent
update to this app) but you haven't re-run `npm run prisma:migrate` in
`server/`, so the live database is missing a column/table the code now
expects. Fix: stop the backend, run `npm run prisma:generate` then
`npm run prisma:migrate` inside `server/`, then `npm run dev` again — check
the backend terminal for the actual Prisma error if it still hangs. As of
this update the app also depends on `express-async-errors` (added to
`server/package.json` — run `npm install` in `server/` if you haven't since
this change) specifically so that this class of bug shows up as a proper
error message on screen instead of an infinite spinner going forward.

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

The Business Goals rename + per-category Remarks split (`Goal` → `BusinessGoal`,
the new `BusinessGoalBusinessUnit` join table, `server/src/routes/goals.ts` →
`server/src/routes/businessGoals.ts`, the `Rock.businessGoalId` rename +
`Rock.remarks` addition, and `QuarterActual.remarks` splitting into
`revenueRemarks`/`collectionsRemarks`/`expensesRemarks`) is a schema change
and needs a fresh `npm run prisma:migrate` to pick up. It's also unverified
end-to-end — worth checking by hand: a Group Integrator/Superadmin can create
a Business Goal, leave it unassigned (global, usable by any Rock), or assign
it to one or more specific Business Units; a Rock's Business Goal dropdown
only offers goals that are global or assigned to the Rock's own Business
Unit, and the server rejects (400) an attempt to tag a Rock with a goal
scoped to a different BU; editing a Business Goal's BU assignment via the
"Manage Business Goals" panel persists correctly; each of Revenue,
Collections, and Expenses has its own independently-saving Remarks field on
both the Operational Grid (inline, per company/quarter) and the Data Entry
form, and a Rock's Remarks field saves and displays independently of its
Description.

The `Company.description` addition (schema field, `POST /api/companies` and
`PUT /api/admin/companies/:id` accepting it, and description inputs on both
the Admin → Companies page and the Target Setup "Add Company" quick-add) is
also a schema change requiring `npm run prisma:migrate`. Worth checking by
hand: adding a company with a description saves and displays it in the Admin
Companies table, leaving it blank works fine (defaults to empty string), and
editing a company's description in place persists after refresh.

**Targets are per-Company again (rolling up to a Business Unit total)** —
`AnnualTarget` and `QuarterTarget` briefly moved to `businessUnitId` in an
earlier iteration of this project, then moved back: `QuarterTarget` keys
off `companyId` again, exactly like `QuarterActual`, and a Business Unit's
number is a computed rollup (sum of its Companies' targets), never stored
directly. Worth checking by hand: Target Setup shows a Company picker for
Quarter Target (alongside Year, Quarter, and Business Unit, the latter now
just used to filter which Companies show up); saving a target for one
Company doesn't affect another Company's target in the same BU; the
Revenue dashboard's Target Distribution Matrix and Operational Grid still
show one row per Business Unit, but those numbers update correctly as the
*sum* of whichever Companies have a target set in that BU (a BU with some
but not all Companies targeted should show a partial, not-yet-complete
total, not zero); a Business Unit with zero Companies targeted shows a zero
target row; drilling the dashboard down to a single Company (via the
Company filter) shows that Company's own target/actual, not its BU's
combined number.

**Annual Target is now a pure computed rollup — the `AnnualTarget` table,
its lock/unlock feature, and its Target Setup entry mode have all been
removed.** Annual Target used to be a separately-entered, lockable figure
(see git history if curious); it's now always just the sum of a Company's
(or Business Unit's) Q1-Q4 `QuarterTarget` rows, computed on the fly in
`server/src/routes/dashboard.ts` — the same relationship the Target
Distribution Matrix already showed between "Distributed Total" and
"Annual Target" before, just made the only source of truth instead of a
separate, possibly-differing entry. This drops the `AnnualTarget` table
entirely (`npm run prisma:migrate` / `prisma migrate deploy` needs to run
the new migration; any previously entered Annual Target data, including
its lock state, is gone). This is unverified end-to-end. Worth checking by
hand: Target Setup no longer has an Annual/Quarter mode toggle — it's
Quarter-only now; there's no lock banner, Unlock button, or "Annual Target
Locked" pop-up anywhere; the Revenue dashboard's Annual Revenue/Collections/
Expenses Target KPI cards update immediately after saving a Quarter Target
(entering Q1 and Q2 for a Company should make those cards reflect Q1+Q2,
even with Q3/Q4 still empty); the Target Distribution Matrix's Annual
Target column always exactly equals its Q1+Q2+Q3+Q4 row for that Business
Unit; the Operational Grid's Annual Target column behaves the same way.
