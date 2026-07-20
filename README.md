# EOS Executive Dashboard

Full-stack dashboard with three views: **Revenue** (Revenue, Collections, and
Expenses — each split Internal / External, in Philippine Peso, each with its
own Remarks field — across a Year → Business Unit → Member Company → Quarter
hierarchy; Annual and Quarter **targets, like actuals, are set once per
Company** — a Business Unit's target is never entered directly, it's a
rollup computed by summing every Company's target within that BU),
**Rocks** (EOS-style 90-day priorities tracked per
Company/Year/Quarter, each with its own Remarks field, tagged against a
shared Business Goals taxonomy that Superadmin/Group Integrator can assign
to one or more Business Units, or leave global), and an **Executive
Scorecard** (a filterable, BU-level-only condensed summary of the same
Revenue and Rocks data, designed for a C-Level/BOD audience). Role-based
access is provided for a Superadmin
(full system access), a Group Integrator (global by default, but can
optionally be scoped to one or more assigned Business Units), and BU
Integrators (always tied to at least one assigned Business Unit, with data
entry, target-setup, and Rock-tracking rights scoped to it). On top of that,
a Superadmin can build named **Custom Roles** — a tickbox matrix granting
View/Edit/Delete over Targets/Revenue/Collections/Expenses/Rocks (plus a
View-only toggle for the Executive Scorecard and for the **Audit Log**) per
Business Unit or individual Company — and assign one to any user for
accountability finer than a blanket Business Unit assignment. Every
mutating action across the app (user/company/business-unit/role changes,
target and actuals edits, Rock changes, SMTP settings, logins) is recorded
in an append-only **Audit Log**, visible to Superadmins by default under
Admin and, like the Executive Scorecard, assignable to other users via a
Custom Role's View toggle. The login screen enforces a **lockout**: 3
consecutive invalid-password attempts on an account locks it for 60 seconds,
after which the count resets automatically. A Group Integrator or Superadmin
can also manually **lock/unlock Targets** for a given Year+Quarter (across
every Company at once) — this is the only mechanism that locks Targets (there
is no automatic calendar-based lock; a Quarter stays editable indefinitely,
past or future, until an admin locks it by hand); unlocking always requires a
reason, which is recorded in the Audit Log.

**Stack:** React (Vite) + Tailwind + Recharts + Lucide on the front end;
Express + TypeScript + Prisma + PostgreSQL on the back end.

**Branding:** `client/public/EOS-logo.png` is the app's header logo
(`client/src/components/Layout.tsx`), and both `EOS-logo.png` and
`client/public/PGB_logo_f.png` (Primary Group of Builders) appear together
on the Login page (`client/src/pages/Login.tsx`). Both are served as static
files straight out of Vite's `public/` folder, so swapping either logo is
just replacing that file in place — no code change needed unless the
filename itself changes. The header nav order (`Layout.tsx`) is Scorecard,
Revenue, Rocks, Data Entry, Target Setup, then Admin — Scorecard leads since
it's the board-level summary view.

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
npm run prisma:migrate     # first-time only: creates all tables from prisma/schema.prisma
npm run seed                # creates only the superadmin account, no sample data
npm run dev                 # starts the API on http://localhost:4000
```

`npm run dev` (and `npm start`) now runs `prisma migrate deploy && prisma
generate` automatically first, via `predev`/`prestart` npm hooks in
`package.json` (deliberately not hooked into `npm run build`, since that's
often run as a pure compile step — e.g. inside a Docker build stage — without
a live database connection available yet) — so every time you pull new code
and
restart the server, any migrations added since your last pull (and the
matching Prisma Client) are applied/regenerated for you, without a separate
manual step. If you ever see an error like `The column "X" does not exist in
the current database`, it means the server started *without* those hooks
running (e.g. an older checkout, or `tsx src/index.ts` invoked directly
instead of via `npm run dev`) — run `npm run prisma:deploy && npm run
prisma:generate` by hand in `server/`, then start the app through `npm run
dev`/`npm start` again so the hooks keep it in sync going forward.

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
  `mustChangePassword`, and a superadmin-only free-text `description` field —
  shown in the app header in place of the user's role, editable only via
  Admin → Users, not by the user themselves), `BusinessUnit`, `UserBusinessUnit` (many-to-many BU
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
  optionally tags a `BusinessGoal`, has its own `remarks` field (plus a
  `description` field, labeled "Target(s)" in the UI — the underlying field
  name didn't change, just what the person filling it out sees), and carries
  `status` (`PENDING` / `ON_TRACK` / `AT_RISK` / `TARGET_MET`) and
  `progressPct` (0-100, a `Float` so it can be entered to 2 decimal places,
  e.g. 45.25) that get updated over time like a project tracker. A
  `BusinessGoal` with no `BusinessGoalBusinessUnit` rows is global (usable by
  any Rock); assigning it to specific Business Units narrows which Rocks can
  tag it, mirroring the same opt-in scoping pattern used for Group
  Integrators. A Rock that's still `PENDING`/`ON_TRACK` once its own Quarter
  is more than 60 days old is automatically flagged `AT_RISK` on read (see
  `server/src/utils/rockAutoStatus.ts`) — see the dedicated bullet below.
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
  - **Blank / no base role** — `role` on `User` is optional (`Role?` in
    `schema.prisma`); Admin → Users' Role dropdown has a "No base role
    (Custom Role only)" option alongside the three above. A blank-role user
    has zero base-role-derived access on their own — no Business Unit
    assignment mechanism, no structural admin actions — and relies entirely
    on an assigned Custom Role (see below) for whatever View/Edit/Delete
    access they get. This exists specifically to let a Superadmin build
    narrow, View-Only-style accounts purely through the Custom Role matrix
    without a base role's coarser scoping getting in the way. A blank-role
    user with no Custom Role assigned at all has no access to anything (a
    safe default, not an accidental "sees everything"): in
    `server/src/middleware/auth.ts`, `hasGlobalBusinessUnitAccess` treats
    `role === null` as globally-scoped *only if* a Custom Role is assigned
    (letting that Custom Role's own per-Business-Unit/Company grants be the
    sole source of truth, unconstrained by any coarse BU filter); with no
    Custom Role, it falls through to the same "restricted to
    `businessUnitIds`" path as a BU Integrator, and a blank-role user's
    `businessUnitIds` is always empty, so every coarse check denies them by
    default.
- **Custom Roles** (`CustomRole`/`RolePermission` in `schema.prisma`,
  `server/src/routes/customRoles.ts`, `server/src/utils/permissions.ts`,
  `client/src/pages/admin/AdminRoles.tsx`): an optional, additional layer of
  access control a Superadmin can build and assign on top of the three base
  Roles above, for finer-grained accountability than "everything in my
  assigned Business Unit(s)." A Custom Role is a named matrix: for any number
  of Business Units and/or specific Companies (multiple of each can be
  selected — a Company-level grant takes precedence over a Business-Unit-level
  one for the same resource when both exist, so a role can grant BU-wide
  access with a narrower or wider carve-out for one Company), independently
  choose View/Edit/Delete for each of seven resources — **Targets** (the
  Target Setup page), **Revenue**, **Collections**, **Expenses** (each
  financial category wherever it appears — Revenue dashboard KPIs/chart/
  matrix/Operational Grid, Data Entry, per-category Remarks), **Rocks**
  (the Rocks page), **Executive Scorecard**, and **Audit Log** (the latter two
  are both coarse "can this user open the page at all" toggles — only their
  View flag is meaningful, since both pages are read-only; the Executive
  Scorecard's figures are still masked by the Revenue/Collections/Expenses/
  Rocks grants like everywhere else, while the Audit Log shows the same
  unfiltered log to anyone granted View on it, since it isn't Business-Unit/
  Company-scoped data in the first place). Admin →
  Roles presents this as the requested tickbox matrix: pick a Business Unit
  or Company on the left (a tree with Business Units expandable to their
  Companies, both independently selectable), and each pick gets its own
  7-resource x View/Edit/Delete grid on the right;
  saving flattens the selections into `RolePermission` rows (only rows with
  at least one box checked are kept). Roles are assigned to a user via a
  "Custom Roles" checkbox list on Admin → Users (hidden for Superadmins, who
  always have full access regardless) — a Superadmin can tick any number of
  roles for the same user (see `UserCustomRole` in `schema.prisma`, the join
  table backing this), not just one; a user's effective Custom-Role access is
  the union of every role assigned to them (`loadUserPermissions()` in
  `middleware/auth.ts` merges each assigned role's `RolePermission` rows into
  one flat list before any `can()`/`hasAnyGrant()` check runs). Assigning a
  role has no effect until it's assigned to at least one user, and a role
  can't be deleted while any user still has it. Enforcement: a user with no
  Custom Role assigned sees zero change in behavior (today's Business-Unit
  scoping applies exactly as before). A user WITH one or more has their access
  narrowed further everywhere that resource shows up — and for a blank-role
  user (see above), the Custom Role isn't just a narrowing layer but the
  entire basis for their access, since they have no base-role scoping to
  narrow in the first place —
  `server/src/routes/targets.ts` (TARGETS view/edit),
  `server/src/routes/actuals.ts` (the combined figures PUT requires edit on
  at least one of Revenue/Collections/Expenses, since that form submits all
  three together; the per-category Remarks PATCH enforces the exact matching
  category instead, since remarks save one category at a time),
  `server/src/routes/rocks.ts` (ROCKS view/edit/delete, including which
  Rocks a broad Rollover actually picks up), `server/src/routes/meta.ts`
  (which Business Units/Companies even appear in dropdowns app-wide — "any
  view, on anything" so a Rocks-only role can still find its Companies), and
  `server/src/routes/dashboard.ts` (any Business Unit/Company with no
  Revenue/Collections/Expenses view at all is dropped entirely rather than
  shown with zeroes; within what remains, Revenue/Collections/Expenses are
  independently zeroed out per Company per category — since the dashboard's
  "headline" KPIs/chart/Operational Grid totals have always been
  revenue-based, a role with only Collections view sees real Collections
  figures alongside zeroed headline numbers). Permissions are looked up fresh
  from the database on every request (not baked into the login token), so
  editing a role's matrix takes effect immediately for anyone assigned to it,
  without needing to log out and back in. Crucially, this narrowing is scoped
  per resource, not all-or-nothing: whether a Custom Role affects, say,
  financial visibility depends on whether that role has ANY row at all for
  Revenue/Collections/Expenses (see `hasAnyGrant()` in `permissions.ts`) — a
  role built to grant only Executive Scorecard view has rows, but none for
  Targets/Revenue/Collections/Expenses/Rocks, so none of that other access is
  touched; the user's base role (e.g. BU Integrator) keeps seeing everything
  it normally would there. A Custom Role only narrows a resource it actually
  addresses — it's additive on top of the base role, never a wholesale
  replacement of it.
- **Executive Scorecard** (`server/src/routes/scorecard.ts`,
  `client/src/pages/Scorecard.tsx`): a third, filterable/interactive view
  aimed at a C-Level/BOD audience — a condensed, Business-Unit-level-only
  (no Company drill-down) re-shaping of the same Revenue dashboard and Rocks
  data into a scorecard: two traffic-light headline cards (Revenue
  Attainment, Rocks Completion) up top, a **Revenue Performance Summary**
  section (Annual Revenue/Collections/Expenses Target cards, Actual-vs-Target
  and Year-to-Date stats, a revenue trend chart, and a sortable per-Business-
  Unit attainment table), and a **Rocks Performance Summary** section (status
  count cards, a sortable per-Business-Unit breakdown, and a "Needs
  Attention" list of At Risk/Pending Rocks sorted lowest-progress-first for
  management-by-exception). Filters are Year, Quarter (or "All Quarters",
  which is the default here since this is meant as a board-level annual
  view), and Business Unit. Default access is Superadmin and Group
  Integrator (matching the default access level of other exec-facing
  features like Business Goals management and Rock Rollover) — a BU
  Integrator needs a Custom Role that explicitly grants **Executive
  Scorecard** view to open the page at all (a plain 403 with an in-page
  "access required" message otherwise); once inside, the actual figures
  shown are still masked by that role's Revenue/Collections/Expenses/Rocks
  grants exactly like the Revenue dashboard and Rocks page.
- **Audit Log** (`AuditLog` in `schema.prisma`, `server/src/utils/auditLog.ts`,
  `server/src/routes/auditLog.ts`, `client/src/pages/admin/AdminAuditLog.tsx`):
  an append-only record of every mutating action taken in the app — who did
  what, to what, and when. Each entry stores a denormalized snapshot of the
  acting user (`userId`/`userName`/`userEmail`) rather than a live foreign
  key, so the log stays readable even after that user is later deleted, and
  deleting a user is never blocked or complicated by their own audit history.
  `action`/`entityType` are free-text (e.g. `USER_CREATE`, `TARGET_QUARTER_UPDATE`,
  `ROCK_ROLLOVER`, `LOGIN`) rather than enums, so new kinds can be added
  anywhere without a migration. Instrumented actions currently cover: user
  create/update/delete, business unit/company create/update/delete, custom
  role create/update/delete, quarter and annual target edits, actuals figure
  and remarks edits, rock create/update/delete/rollover, business goal
  create/update/delete, SMTP settings updates (the password value itself is
  never logged, only that it changed), and successful logins. Writing an
  audit entry never throws — a failed write is caught and logged to the
  server console rather than breaking the request that triggered it. The
  Admin → Audit Log page is a paginated, filterable table (by free-text
  search over summary/user, action, entity type, and date range) with each
  row expandable to show its raw metadata. Default access is Superadmin;
  like the Executive Scorecard, a non-superadmin can be granted access via a
  Custom Role's Audit Log View toggle. The page is wired to two routes:
  `/admin/audit-log`, nested inside the Superadmin-only `AdminLayout` so the
  Admin tab bar stays mounted and the tab behaves exactly like Users/Roles/
  Companies/etc. (this is the one Superadmins use, linked from that tab
  bar), and a second, top-level `/audit-log` route (outside `/admin/*`,
  alongside `/scorecard`) that exists purely so a non-superadmin granted
  access via a Custom Role has any way to reach the page at all, since the
  whole `/admin/*` tree is client-side gated to Superadmin only and would
  otherwise be unreachable for them. The backend is the real gate either
  way, surfacing a 403 with an in-page "access required" message for anyone
  without it.
- **Login lockout** (`failedLoginAttempts`/`lockedUntil` on `User` in
  `schema.prisma`, `POST /api/auth/login` in `server/src/routes/auth.ts`,
  `client/src/pages/Login.tsx`): 3 consecutive invalid-password attempts on
  an account locks it for 60 seconds; a successful login, or the lock simply
  expiring, resets the count back to 0. Tracked per User row rather than
  per-IP (no separate rate-limiting infrastructure needed, and it protects
  the account regardless of where the attempts come from). While locked,
  `POST /api/auth/login` returns `423` with a "Try again in N seconds"
  message computed from the actual time remaining, and the Login page
  disables the Sign in button and runs its own client-side countdown over
  that window so there's no guessing when to retry. Every failed attempt
  and every lock event is written to the Audit Log too (`LOGIN_FAILED` /
  `LOGIN_LOCKED`, alongside the existing `LOGIN` action for successes) —
  these snapshot the target account's id/name/email even though there's no
  authenticated actor to attribute the entry to (the credentials never
  validated), so a Superadmin reviewing the log can still see which account
  was targeted and how many attempts it took.
- **Manual Target Locks** (`TargetLock` in `schema.prisma`, the
  `GET /api/targets/locks` / `POST /api/targets/lock` /
  `POST /api/targets/unlock` endpoints in `server/src/routes/targets.ts`,
  the "Target Locks" panel in `client/src/pages/TargetConfig.tsx`): a
  Group Integrator or Superadmin can lock or unlock a Year+Quarter's
  Targets directly, and this is the *only* thing that locks a Quarter's
  Targets — there is no automatic calendar-based lock. A Quarter, past or
  future, stays editable indefinitely until an admin locks it by hand. A
  lock applies to every Company's Targets for that Year+Quarter at once
  (there's no per-Business-Unit/Company scoping) and is base-role-gated
  only — `requireRole("GROUP_INTEGRATOR", "SUPERADMIN")`, not something a
  Custom Role can grant, since this is a governance action, not a
  data-editing one. Locking is a simple, idempotent create (`TargetLock`
  existing for that Year+Quarter = locked); unlocking always requires a
  reason (minimum 3 characters), which isn't stored on `TargetLock` itself
  (that table only ever reflects *current* lock state) but is written
  straight to the Audit Log (`TARGET_UNLOCK`, alongside `TARGET_LOCK` for
  locking) — so there's a permanent, reviewable record of who unlocked what
  and why, even though the lock can be freely re-applied afterward. The
  Target Setup page's "Target Locks" panel (visible only to a Group
  Integrator/Superadmin) shows all four quarters of the selected Year with
  their current state — Open, or Locked by *name* — with Lock/Unlock
  buttons; clicking Unlock prompts for the required reason before calling
  the API. The existing Quarter/Annual lock messaging and disabled-state
  logic (`isQuarterLocked`, `lockedQuarters`, `allQuartersLocked`) reads
  purely off the manual lock now.
- **API** (`server/src/routes`): JWT auth (login accepts email or username),
  a `PUT /api/auth/profile` self-service endpoint (any authenticated user can
  update their own name/email/username; deliberately excludes `role`,
  `description`, Business Unit assignment, and Custom Role, which stay
  superadmin-only via `PUT /api/admin/users/:id` — returns a fresh token
  since those fields travel in it, same as login/change-password),
  a `POST /api/auth/change-password` flow that's enforced whenever a user's
  `mustChangePassword` flag is set (e.g. the seeded superadmin's first
  login, or any account an admin resets), CRUD for Years/BUs/Companies
  (Group Integrator or Superadmin), `GET /api/current-quarter` (returns the
  real calendar quarter "right now" per the server clock — `{ year, quarter,
  yearId, start, end }`, with `yearId` `null` if that Year hasn't been
  created yet — backed by `server/src/utils/quarterDates.ts`, which maps
  Year+Quarter to actual calendar dates: Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 =
  Jul-Sep, Q4 = Oct-Dec; this is the one authoritative place any future
  date/quarter-gated logic should hook into, rather than each feature
  re-deriving it), `server/src/routes/targets.ts` (`PUT /api/targets/quarter`
  upserts one Quarter's target keyed by `companyId` + `yearId` + `quarter` —
  Group Integrator, Superadmin, or a BU Integrator scoped to their own
  Business Unit(s), mirroring how actuals are scoped. There is still no
  separately-*stored* Annual Target row — Annual Target on the Revenue
  dashboard remains purely a derived sum of Q1-Q4 — but `PUT
  /api/targets/annual` offers a convenience way to *enter* one: it splits
  the submitted total evenly across the Year's still-editable quarters
  (manually-locked quarters keep their existing values, subtracted from the
  total first; if the request has zero editable quarters left, it 400s).
  Both endpoints enforce the manual Target Lock rule — a Quarter with a
  `TargetLock` row for it is rejected with a 403 on any further direct
  edit, and otherwise stays editable indefinitely regardless of calendar
  date — and both keep every Company's Q1-Q4 sum for a Year invariant
  across edits: saving one Quarter's target redistributes the delta across
  that Company's *subsequent* Quarters only (never prior ones), split
  evenly and clamped at zero, so the annual total doesn't drift. This logic
  lives in `targets.ts` itself (`getManuallyLockedQuarters`, `splitEvenly`,
  `distributeAdjustment` — no schema changes were needed since it's pure
  business logic over the existing `QuarterTarget` rows),
  `server/src/routes/actuals.ts`
  (quarterly actuals + per-category remarks upserts keyed by `companyId` +
  `yearId` + `quarter`, BU Integrator scoped to their assigned BUs), a
  superadmin-only `server/src/routes/admin.ts` with full CRUD over
  Users/Companies/Business Units, a superadmin-only
  `server/src/routes/customRoles.ts` with full CRUD over Custom Roles and
  their permission matrix (see the Custom Roles bullet above), a superadmin-only
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
  remark belongs to one specific quarter; on load it calls
  `GET /api/current-quarter` and defaults Year+Quarter to the real current
  calendar quarter if that Year already exists, falling back to the first
  available Year otherwise), color-coded KPI cards in three
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
  in the nav) sets targets by Year + Business Unit + **Company** — exactly
  the same Company-level granularity as Data Entry/actuals — via two modes,
  a "Set by Quarter" / "Set Annual Target" toggle: Quarter mode sets one
  Quarter at a time (with a Quarter picker that marks already-passed
  quarters "(locked)" and disables their inputs/Save button); Annual mode
  enters one full-year total per category, pre-filled with the Company's
  current annual sum, and splits it evenly across the Year's still-editable
  quarters on save (already-locked quarters are called out and left
  untouched). Either mode's edit rolls up into its Business Unit's total
  shown on the Revenue dashboard, and editing one Quarter automatically
  redistributes the change across that Company's *subsequent* Quarters so
  the Q1-Q4 sum for the Year doesn't drift (see the dedicated note further
  down). Target Setup and
  Data Entry (`pages/IntegratorPortal.tsx`) both default their Year+Quarter
  to the real current calendar quarter the same way the Revenue dashboard
  does (via `GET /api/current-quarter`); the Rocks page does too for its Year,
  but deliberately keeps defaulting its Quarter filter to "All Quarters"
  since it's meant as a broad overview. There's no Annual
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
  Integrators/Superadmin); an **Executive Scorecard** page
  (`pages/Scorecard.tsx`, nav-linked for all three roles — a BU Integrator
  without SCORECARD access gets a clean "access required" message in the
  page body rather than a broken screen) with its own compact Year/Quarter/
  Business Unit filter row, two sortable Business-Unit-level summary tables
  (click a column header to sort), a Recharts revenue trend chart, and a
  "Needs Attention" Rocks list — all described in the Executive Scorecard
  bullet above; a forced Change Password screen, and a
  Superadmin-only `/admin` section (`client/src/pages/admin`) with tabs for
  Users (including the Business Unit assignment checklist and the Custom
  Role dropdown), Roles (the Custom Role tickbox-matrix builder), Companies,
  Business Units, and SMTP Settings.

- **Seed script** (`server/prisma/seed.ts`): a hard reset, not a passive
  seed. Every time you run `npm run seed` it wipes all Business Units,
  Companies, Years, targets, actuals, Rocks, Business Goals, Custom Roles,
  and any non-superadmin users, then ensures the superadmin account exists.
  This is what to run if
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

**Custom Roles** (the `CustomRole`/`RolePermission` schema additions,
`server/src/routes/customRoles.ts`, `server/src/utils/permissions.ts`,
enforcement changes across `targets.ts`/`actuals.ts`/`rocks.ts`/
`dashboard.ts`/`meta.ts`, and `client/src/pages/admin/AdminRoles.tsx`) is a
purely additive feature — every existing User keeps `customRoleId = NULL`
after migrating, which every enforcement point treats as "fall back to
today's Business-Unit scoping, unchanged." This needs a fresh
`npm run prisma:migrate` to pick up the new tables/column, and is
unverified end-to-end. Worth checking by hand: Admin → Roles lets you build
a role by ticking a Business Unit and/or one of its Companies in the tree on
the left (both independently selectable) and, for each pick, checking
View/Edit/Delete boxes per resource (Targets/Revenue/Collections/Expenses/
Rocks) in the matrix on the right; saving with nothing ticked anywhere is
rejected; assigning that role to a BU Integrator or Group Integrator via the
new "Custom Role" dropdown on Admin → Users immediately (no re-login needed)
narrows what that user sees — a role with only REVENUE view on one Company
should show that Company's real Revenue figures on the dashboard but 0 for
Collections/Expenses, and should hide every other Business Unit/Company
entirely rather than showing them with zeroes; a role with TARGETS edit but
no ROCKS access lets that user save Quarter Targets but the Rocks page
and its API reject create/edit/delete for them; a role can't be deleted
while still assigned to a user (the delete button is disabled with a
tooltip explaining why); clearing a user's Custom Role (setting it back to
"None") restores today's default Business-Unit-wide behavior for them.

**Executive Scorecard** (the `SCORECARD` addition to the `PermissionResource`
enum, `server/src/routes/scorecard.ts`, and `client/src/pages/Scorecard.tsx`)
needs a fresh `npm run prisma:migrate` to pick up the new enum value (a
single `ALTER TYPE ... ADD VALUE`, purely additive), and is unverified
end-to-end. Worth checking by hand: logging in as the Superadmin or a Group
Integrator opens `/scorecard` directly with no extra setup; logging in as a
BU Integrator with no Custom Role shows the "access required" message
instead of data, and the same BU Integrator gains access the moment a
Superadmin assigns them a Custom Role with SCORECARD view checked (no
re-login needed, same as every other Custom Role change); the Year/Quarter/
Business Unit filters reload the page's data and the two Business-Unit
breakdown tables are sortable by clicking their column headers (an arrow
flips direction on a second click); a role with SCORECARD view but only
ROCKS view (no financial resources) sees a real Rocks Performance Summary
but zeroed-out Revenue figures, and vice versa for a role with only
financial view; the "Needs Attention" list only ever shows At Risk/Pending
Rocks, sorted lowest-progress-first, and reflects the current Year/Quarter/
Business Unit filter.

**Annual Target entry, Quarter cascade, and Quarter locking** (all in
`server/src/routes/targets.ts` — no schema change, since it's pure business
logic layered over the existing `QuarterTarget` rows and the existing
`quarterDates.ts` calendar utility). Three related behaviors, all scoped
only to Targets (Actuals are untouched):
1. `PUT /api/targets/annual` is a new endpoint that takes one Company/Year
   and a full-year Figures total, and splits it evenly across that Year's
   still-editable Quarters (`splitEvenly`, remainder-to-last-quarter so the
   split always sums exactly). Quarters already locked by the calendar (see
   #3) keep their existing values, which are subtracted from the annual
   total before splitting the remainder across what's left; if every
   Quarter is locked, it 400s instead of silently doing nothing.
2. Saving a single Quarter's target (`PUT /api/targets/quarter`, and
   internally after an annual split) now redistributes the delta — the
   difference between the new and previous value, per category/Internal-
   External field independently — across that Company's *subsequent*
   Quarters of the same Year only, never prior ones (`distributeAdjustment`,
   equal shares that self-correct quarter-to-quarter, clamped at zero rather
   than going negative; if clamping prevents fully absorbing a decrease, the
   shortfall is dropped rather than blocking the save, so the implied annual
   total can shrink in that edge case but the save never fails). This keeps
   "sum of Q1-Q4" stable across everyday edits without resurrecting a
   separately-stored Annual Target row — the invariant is maintained
   procedurally, not by storing a target-and-lock-it figure the old
   `AnnualTarget` table used to.
3. **(Superseded — see "Manual Target Locks" above.)** This point originally
   had both endpoints reject edits to a Quarter once the real calendar date
   (per `quarterDates.ts`) had moved past it (`isQuarterEditable`), with
   `pages/TargetConfig.tsx` marking locked quarters "(locked)" in the
   Quarter dropdown accordingly. That automatic calendar-based lock has
   since been removed entirely: a Quarter now stays editable indefinitely,
   past or future, unless a Group Integrator/Superadmin has explicitly
   locked it via the manual `TargetLock` mechanism described above. Locked
   Quarters (manual locks only, now) are still excluded from the annual
   split's target set the same way.

This is unverified end-to-end (no npm registry access in this sandbox — see
the note at the top of this section). Worth checking by hand: setting an
Annual Target of ₱400,000 Revenue on a Company with no prior targets splits
into ₱100,000 per quarter; raising Q2 to ₱150,000 afterward drops Q3 and Q4
to ₱75,000 each (Q1 stays at ₱100,000) so the total stays ₱400,000; lowering
Q2 back down raises Q3/Q4 again the same way; manually locking Q1 via the
Target Locks panel disables its Quarter-mode inputs and Save button with a
lock message, and a direct `PUT /api/targets/quarter` for Q1 then returns
403; setting a new Annual Target in that state leaves Q1 untouched and
splits only across Q2-Q4; on a Company with all four quarters already at
zero, saving Q1 for the first time doesn't push Q2-Q4 negative (clamped, so
they simply stay at zero).

**Blank ("no base role") Users** (`role Role?` on `User` in
`schema.prisma`, `server/src/middleware/auth.ts`,
`server/src/routes/admin.ts`, `client/src/pages/admin/AdminUsers.tsx`) needs
a fresh `npm run prisma:migrate` to drop the `NOT NULL` constraint on
`User.role` (purely additive/relaxing, no data migration needed — every
existing user keeps their current role). Admin → Users' Role dropdown now
has a "No base role (Custom Role only)" option; picking it hides the
Business Unit checklist (a blank-role user has no BU-assignment mechanism
of its own) but keeps the Custom Role dropdown visible with a nudge that a
Custom Role should be assigned so the user can see anything. Enforcement is
a single added branch in `hasGlobalBusinessUnitAccess`: a blank-role user
with a Custom Role assigned bypasses the coarse Business-Unit gate entirely
so that Custom Role's own per-Business-Unit/Company grants are the sole
source of truth (unconstrained by any BU assignment, since blank-role users
don't have one); a blank-role user with no Custom Role at all has no access
to anything. This is unverified end-to-end. Worth checking by hand:
creating a user with no base role and no Custom Role can log in but every
page shows nothing/403; assigning that user a Custom Role with, say,
REVENUE view on one Company immediately (no re-login) shows just that
Company's Revenue figures and hides everything else, exactly as if the
Custom Role were the user's entire identity; the Admin → Users table shows
a "No base role" pill instead of crashing; demoting the last remaining
Superadmin to blank is rejected the same way demoting them to any other
role is. (The app header no longer shows a role label at all — see the
Profile/description feature below for what replaced it.)

**Self-service Profile page + User descriptions** (`User.description` in
`schema.prisma`, `PUT /api/auth/profile` in `server/src/routes/auth.ts`,
`client/src/pages/Profile.tsx`, `client/src/components/Layout.tsx`) needs a
fresh `npm run prisma:migrate` to add the `description` column (purely
additive, defaults every existing row to `""`). Two related changes:
1. Any logged-in user can now manage their own account under a new "My
   Profile" page (linked from a profile icon and their name/description in
   the header) — update their own name/email/username, and change their
   password (reusing the existing change-password flow). `PUT
   /api/auth/profile` is deliberately narrower than the superadmin's `PUT
   /api/admin/users/:id`: it can't touch `role`, `description`, Business
   Unit assignment, or Custom Role.
2. A Superadmin can set a free-text `description` per user from Admin →
   Users (a new field in the create/edit form, plus a column in the table)
   — e.g. their title or team. The app header's top-right corner, which
   used to show the user's role (Superadmin/Group Integrator/BU
   Integrator/No base role), now shows this description instead, and shows
   nothing at all if it's blank — the role is no longer displayed there
   (still visible in Admin → Users' Role column for anyone who needs it).

This is unverified end-to-end. Worth checking by hand: a non-superadmin user
can open My Profile and update their name/email, and the header updates
immediately without a re-login; changing password from My Profile works the
same as the existing forced first-login flow; a user cannot set their own
description (no field for it exists on My Profile); a Superadmin setting a
user's description in Admin → Users immediately shows up under that user's
name in the header the next time they load the app (after their token
refreshes, e.g. next login — same staleness as editing anyone's name/role
today); leaving a user's description blank shows nothing under their name in
the header rather than an empty line or a fallback to their role.

**Audit Log** (the `AuditLog` model and the `AUDIT_LOG` addition to the
`PermissionResource` enum in `schema.prisma`, `server/src/utils/auditLog.ts`,
`server/src/routes/auditLog.ts`, the `logAudit(...)` calls added across
`admin.ts`/`meta.ts`/`customRoles.ts`/`targets.ts`/`actuals.ts`/`rocks.ts`/
`businessGoals.ts`/`settings.ts`/`auth.ts`, and
`client/src/pages/admin/AdminAuditLog.tsx`) needs a fresh
`npm run prisma:migrate` to pick up the new enum value and table (two
separate migrations — Postgres won't allow using a freshly-added enum value
in the same transaction it was added in, so the `AUDIT_LOG` enum addition and
the `AuditLog` table creation are deliberately split into two migration
files, matching the same split used for the earlier `SCORECARD` addition).
This is unverified end-to-end. Worth checking by hand: logging in as the
Superadmin shows an "Audit Log" tab under Admin, and opening it shows recent
entries (including the login that just happened) with Time/User/Action/
Entity/Summary columns; clicking a row expands it to show that entry's raw
metadata as formatted JSON; the Search box filters by summary/user name/
email, the Action and Entity type dropdowns are populated from
`GET /api/audit-log/meta` (only options with real matches show up — no
hardcoded/stale list), the From/To date filters narrow the range, and
Pagination moves between pages of 50; making a change anywhere instrumented
(e.g. editing a Quarter Target, creating a Rock, updating SMTP settings)
shows up as a new entry without needing a page refresh of the underlying
data (a fresh load of Audit Log picks it up); the SMTP settings entry never
shows the actual password value, only that settings were updated and
whether the password changed; logging in as a BU Integrator with no Custom
Role gets a 403 and the "access required" message on `/audit-log` (the nav
link is still shown to them, same as Scorecard — the backend is the real
gate); assigning that BU Integrator a Custom Role with Audit Log view
checked grants access immediately (no re-login needed); deleting a user who
has existing audit log entries succeeds without error, and their old entries
still show their name/email (the snapshot), not a broken reference; clicking
the Audit Log tab from Admin → Users (or any other Admin tab) navigates to
`/admin/audit-log` and the tab bar stays visible/mounted the whole time,
exactly like switching between Users/Roles/Companies (this was a follow-up
fix — the tab originally pointed at the top-level `/audit-log` route, which
sits outside `AdminLayout` and made the tab bar disappear on click; see the
comments in `App.tsx` and `AdminLayout.tsx` next to both routes for why both
still exist).

**Login lockout** (`failedLoginAttempts`/`lockedUntil` on `User` in
`schema.prisma`, `POST /api/auth/login` in `server/src/routes/auth.ts`,
`client/src/pages/Login.tsx`) needs a fresh `npm run prisma:migrate` to pick
up the two new columns (purely additive — every existing row defaults to 0
attempts / no lock). This is unverified end-to-end. Worth checking by hand:
entering a wrong password twice shows "Invalid credentials" both times;
the 3rd wrong attempt in a row instead shows "Too many failed attempts. Try
again in 60 seconds." with an amber (not red) message, and the Sign in
button greys out and counts down from 60 in its own label; trying to log in
again before the countdown finishes (even with the *correct* password)
still returns the same locked response with the actual time remaining, not
a fresh 60 seconds; once the countdown reaches 0, the correct password logs
in normally and the 3-attempt counter is back at zero (no lingering partial
count from before the lock); a 4th, 5th, etc. wrong password entered *after*
a successful login (or after the lock naturally expired without ever
succeeding) starts counting from 1 again, not from wherever it left off;
Admin → Audit Log shows a `LOGIN_FAILED` entry for each of the first two
wrong attempts and a `LOGIN_LOCKED` entry for the 3rd, all attributed to the
target account's name/email even though no session was ever established.

**Manual Target Locks** (the `TargetLock` model in `schema.prisma`, the
three new endpoints in `server/src/routes/targets.ts`, the "Target Locks"
panel in `client/src/pages/TargetConfig.tsx`) needs a fresh
`npm run prisma:migrate` to pick up the new table (purely additive — no
existing data is affected, every Year+Quarter starts unlocked). This is
the only mechanism that locks a Quarter's Targets — there is no automatic
calendar-based lock, so a past Quarter stays editable indefinitely unless
locked by hand. This is unverified end-to-end. Worth checking by hand:
logging in as a Group Integrator or Superadmin shows a "Target Locks" panel
on Target Setup with Q1-Q4 for the selected Year, each either "Open" or
"Locked by *name*"; clicking Lock on an open quarter immediately shows it as
"Locked by *your name*" with an Unlock button, and switching to Quarter mode
for that quarter now shows the locked banner and disables its inputs/Save —
for every Company, not just the one currently selected; a past quarter with
no lock stays fully editable ("Open") indefinitely; clicking Unlock prompts
for a reason, cancelling the prompt does nothing, submitting it blank shows
a validation message without calling the API, and submitting a real reason
unlocks the quarter immediately (button reverts to "Lock", and the quarter
becomes editable again right away since there's no calendar lock underneath
it); logging in as a BU Integrator (no Custom Role, or one with TARGETS
edit) does not show the Target Locks panel at all, and if they somehow call
the lock/unlock API directly they get a 403; Admin → Audit Log shows a
`TARGET_LOCK` entry when locking and a `TARGET_UNLOCK` entry (with the
reason in its metadata, visible when the row is expanded) when unlocking.

**Revenue dashboard default filters, Rock "Target(s)" relabel, 2-decimal
Rock progress, and auto-At-Risk escalation** (`client/src/components/
FilterBar.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/pages/
Rocks.tsx`, `client/src/pages/Scorecard.tsx`, `client/src/utils/format.ts`,
`Rock.progressPct` in `schema.prisma`, `server/src/routes/rocks.ts`,
`server/src/routes/scorecard.ts`, and a new `server/src/utils/
rockAutoStatus.ts`) needs a fresh `npm run prisma:migrate` to widen
`progressPct` from `INTEGER` to `DOUBLE PRECISION` (purely additive — every
existing whole-number value casts cleanly, no data loss). Four small,
independent changes:
1. The Revenue dashboard already defaulted Year/Quarter to the real current
   calendar quarter and Business Unit/Company to "all" for a Group
   Integrator/Superadmin (a BU Integrator still defaults to their first
   assigned Business Unit, since "all" isn't a real option for that role) —
   `FilterBar.tsx`'s effect just didn't carry the real current quarter
   number into its fallback branch (today's real Year not existing yet in
   the system). Fixed so that fallback still uses the real current quarter
   number instead of leaving whatever quarter happened to be in the
   component's initial state.
2. The Rock form's "Description (optional)" label now reads "Target(s)
   (optional)" — purely a label change; the field is still `description`
   under the hood (`Rocks.tsx`), so no schema/API change was needed.
3. `progressPct` now accepts up to 2 decimal places (e.g. 45.25%) instead of
   only whole numbers — the zod schemas in `routes/rocks.ts` dropped `.int()`
   and round to 2dp server-side via `.transform()` regardless of what a
   client sends; both the Add/Edit Rock form and the inline table input
   in `Rocks.tsx` got `step="0.01"`; a new `formatProgressPct` helper in
   `utils/format.ts` rounds to 2dp and trims trailing zeros for display
   (`45%` stays `45%`, `45.25%` shows in full) in both `Rocks.tsx` and
   `Scorecard.tsx`'s "Needs Attention" list. `progressPct` is a Prisma
   `Float` rather than `Decimal` specifically so Prisma Client keeps
   returning a plain JS `number` here — a `Decimal` column would come back
   as a `Decimal.js` object and silently break the existing `+`/`-`/
   `Math.round` arithmetic on this field throughout the app.
4. **Auto-At-Risk escalation** (`server/src/utils/rockAutoStatus.ts`,
   called from both `GET /api/rocks` and `GET /api/scorecard`): a Rock
   that's still `PENDING` or `ON_TRACK` once its own Quarter started more
   than 60 days ago is automatically flagged `AT_RISK`. This runs inline on
   every read rather than on a schedule (the app has no background job
   runner), so it's at most one page-load stale, and covers every Quarter
   in the Year being viewed, not just whichever Quarter is currently
   filtered on. It's a continuously-enforced rule, not a one-time nudge:
   nothing disables the Status dropdown, so a Group/BU Integrator can
   freely re-edit the status afterward (including straight back to
   `ON_TRACK`), but as long as the Rock stays incomplete past the 60-day
   mark, the next read re-asserts `AT_RISK` — the only thing that actually
   clears it for good is marking the Rock `TARGET_MET`, since that status is
   excluded from the check entirely. Each escalation writes one
   `ROCK_AUTO_AT_RISK` Audit Log entry (metadata lists the affected Rock
   ids) with no attributed user, the same "system action" pattern already
   used for `LOGIN_FAILED`/`LOGIN_LOCKED` entries. Status badge colors were
   also standardized across `Rocks.tsx` and `Scorecard.tsx`: Orange =
   Pending, Blue = On Track, Red = At Risk, Green = Target Met.

This is unverified end-to-end. Worth checking by hand: opening the Revenue
dashboard with no filters previously set lands on the real current Year and
Quarter with Business Unit/Company both on "All" (for a Group Integrator/
Superadmin); the Rock form shows "Target(s) (optional)" where "Description
(optional)" used to be; entering `33.33` into a Rock's Progress % field and
saving keeps `33.33` (not rounded to `33`); creating a Rock dated more than
60 days into a past Quarter with status left at "Pending" shows as "At Risk"
(orange no longer) the next time the Rocks page loads, and the Audit Log
shows a `ROCK_AUTO_AT_RISK` entry; manually switching that Rock back to "On
Track" saves and displays correctly right away, confirming the field isn't
locked; reloading the page without changing anything else re-flags it "At
Risk" again, since the Rock is still incomplete past the 60-day mark;
setting it to "Target Met" instead makes it stick, since Target Met Rocks
are excluded from the check.

**Custom Roles: additive-only narrowing + multiple roles per user**
(`server/src/utils/permissions.ts`'s new `hasAnyGrant()` helper and its use
across `dashboard.ts`/`actuals.ts`/`targets.ts`/`rocks.ts`/`scorecard.ts`/
`meta.ts`; the new `UserCustomRole` join table in `schema.prisma` replacing
`User.customRoleId`; `AuthUser.customRoleIds: string[]` in
`middleware/auth.ts`; `routes/auth.ts`, `routes/admin.ts`; and
`client/src/pages/admin/AdminUsers.tsx`'s Custom Roles checkbox list) fixes
two related problems with Custom Roles and needs a fresh
`npm run prisma:migrate` (the new migration also backfills every existing
single `customRoleId` assignment into the join table before dropping the old
column, so no one loses their currently-assigned role). Two independent
changes:
1. **Bug fix — narrowing is now per-resource, not all-or-nothing.** Every
   enforcement point used to gate narrowing on "does this user have *any*
   Custom Role rows at all" (`permRows.length`), which meant a role that only
   ever grants, say, `SCORECARD` view would still trip the financial-data
   narrowing everywhere else in the app — a BU Integrator given a
   Scorecard-only role lost all their normal Revenue/Collections/Expenses
   visibility, even though the role never mentioned those resources. Fixed by
   gating each narrowing block on `hasAnyGrant(rows, <the specific
   resource(s) that block cares about>)` instead — narrowing for a resource
   only ever engages if the assigned role(s) actually have at least one row
   for that resource; a role that never touches a resource leaves the base
   role's normal access to it completely untouched. This preserves the
   original, intentional narrowing behavior (a role that DOES grant, say,
   Collections-view-only for one Company still narrows exactly as before) —
   it only stops narrowing from firing for resources the role never
   addresses at all. `meta.ts`'s dropdown-visibility filtering is gated on
   `hasAnyGrant(rows, ALL_RESOURCES)` specifically (excluding `AUDIT_LOG`,
   matching its existing "any view, on anything" intent) so a role that only
   grants Audit Log view doesn't wipe out Business Unit/Company dropdowns
   app-wide either.
2. **Feature — a Superadmin can now assign any number of Custom Roles to the
   same user**, not just one. A user's effective Custom-Role access is the
   union of every assigned role's permission matrix
   (`loadRolePermissionsForRoles()` in `permissions.ts`, called from
   `loadUserPermissions()`). Admin → Users' single "Custom Role" dropdown is
   now a "Custom Roles" checkbox list (matching the existing Business Unit
   assignment checklist style) — ticking, say, both a "Scorecard viewer" role
   and a "Rocks editor" role gives that user both sets of grants at once.

This is unverified end-to-end. Worth checking by hand: assigning a BU
Integrator a Custom Role with only Executive Scorecard view checked (no
Targets/Revenue/Collections/Expenses/Rocks rows at all) leaves every one of
their existing Revenue dashboard figures, Target Setup access, and Rocks
access completely unchanged, while also unlocking the Scorecard page for
them; a role that DOES include, say, a Collections-only view row for one
Company still narrows that user down to just that Company/category as
before; on Admin → Users, ticking two different Custom Roles for the same
user and saving shows both role names (comma-separated) in the Custom Roles
column, and re-opening the edit form shows both checkboxes still ticked;
removing one of the two roles (unticking it and saving) leaves the other
role's grants intact; a role still can't be deleted while any user has it
checked, even if that user also has other roles assigned.

**Currency formatting: 2-decimal full amounts + abbreviated KPI cards**
(`client/src/utils/format.ts`'s `formatCurrency()` and new
`formatCurrencyShort()`, `client/src/components/KpiCards.tsx`, and
`client/src/pages/Scorecard.tsx`'s `HeadlineCard`/`CategoryCard`/
`SummaryStat`) is a pure frontend formatting change — no schema/migration
needed. Two related tweaks:
1. `formatCurrency()` now always shows exactly 2 decimal places (e.g.
   `₱1,234.50`, `₱1,234.00`) instead of rounding to whole pesos — this is the
   "complete", non-abbreviated form used everywhere except the KPI-style
   cards below (Operational Grid, Target Matrix, Data Entry, Target Setup,
   the Scorecard's per-Business-Unit tables, etc. all pick this up
   automatically since they already called the same helper). Entry fields
   for Targets/Actuals already accepted 2 decimal places (`step="0.01"`), so
   this only changes how the figures are displayed.
2. The large headline figures on the Revenue dashboard's `KpiCards.tsx` and
   the Executive Scorecard's summary cards now render abbreviated via the new
   `formatCurrencyShort()` — ₱6,512,700,000.00 shows as "₱6.512B",
   ₱1,100,000,000.00 as "₱1.1B", ₱600,000,000.00 as "₱600M" (K/M/B thresholds
   at 1,000/1,000,000/1,000,000,000; truncated — not rounded — to at most 3
   decimal places with trailing zeros trimmed, so a card never implies more
   precision than it has). Every abbreviated card carries the full,
   non-abbreviated `formatCurrency()` value as its native `title` tooltip, so
   hovering over any shorthand figure shows the exact peso amount. Values
   under ₱1,000 aren't abbreviated at all — they render with `formatCurrency()`
   as before.

Worth checking by hand: any Target/Actual entry with cents (e.g. 1234.50)
now displays with the cents intact throughout the Operational Grid, Target
Matrix, and Data Entry pages instead of getting rounded off; a Business Unit
or Company with a billions-scale Annual Target shows the shorthand form on
its KPI card (Revenue dashboard) and Scorecard summary card, and hovering
over that figure with the mouse shows a native tooltip with the exact peso
amount to the cent; a Business Unit with only a few thousand pesos in
targets/actuals still shows its full amount on the card (no abbreviation
under ₱1,000).

**Scorecard as the default landing page** (`client/src/App.tsx`'s route
table, `client/src/components/Layout.tsx`'s nav links) swaps which page owns
the root `/` path: the Executive Scorecard is now the index route (what
`navigate("/")` after login/password-change lands on, and what a non-
superadmin gets redirected to if they try to reach `/admin`), and the Revenue
dashboard moved to its own `/revenue` path. Purely a route-table change, no
schema/API/backend changes. Worth checking by hand: logging in lands
directly on the Scorecard page instead of the Revenue dashboard; the
Scorecard nav link is still first and now highlights as active on that
landing page; the Revenue nav link goes to `/revenue` and highlights
correctly there; a user without Scorecard access (a BU Integrator with no
Custom Role granting `SCORECARD` view) sees the existing "access required"
card immediately after logging in rather than a blank/broken page, and can
still reach the Revenue dashboard via its nav link.

**Add/Edit Rock as a closable pop-up** (`client/src/pages/Rocks.tsx`) is a
pure frontend change — no schema/API changes. The Add/Edit Rock form, which
previously rendered inline as its own section further down the page, is now
a modal pop-up: a dimmed full-screen overlay with the form centered on top,
closable via its X button, its Cancel button, or clicking the dimmed
backdrop outside the form (the form itself stops that click from bubbling to
the backdrop, so clicking inside it never closes it accidentally). On a
successful save the pop-up auto-closes and a brief "Rock added/updated
successfully" toast appears bottom-right for 3 seconds before dismissing
itself. Worth checking by hand: clicking "Add Rock" (or the pencil icon to
edit an existing one) opens the form as a centered overlay instead of
pushing page content down; the page behind it is visibly dimmed and doesn't
scroll independently of the pop-up; clicking outside the form, its X, or
Cancel all close it without saving; submitting a valid Rock closes the
pop-up immediately and shows the success toast, which disappears on its own
after a few seconds without needing to be dismissed manually; submitting an
invalid Rock (e.g. missing Title) keeps the pop-up open and shows the
existing inline validation error instead of closing.

**Rocks: pagination + sortable column headers** (`client/src/pages/Rocks.tsx`,
new shared `client/src/components/Pagination.tsx` and
`client/src/components/SortableTh.tsx`) is a pure frontend change — no
schema/API changes. The Rocks table now shows 10 rocks per page instead of
the full filtered list at once, with a "Showing X-Y of Z" caption and
Prev/Next controls underneath. Every column header (Company, Quarter, Rock,
Business Goal, Owner, Status, Progress) is now clickable to sort by that
column — click again to reverse direction — with an arrow icon showing the
active column and direction. Sorting or changing a filter resets back to
page 1 so the table never lands on a now-empty page; quickly editing a
Rock's Status/Progress inline does not reset the page, so an in-place edit
doesn't yank the table back to the start. `Pagination` and `SortableTh` are
built as standalone, reusable components (not Rocks-specific) so the new
Reports engine below reuses both instead of re-implementing pager/sort-header
UI. Worth checking by hand: a filtered Rocks list with more than 10 results
shows a pager, and Prev/Next move through pages correctly, clamping at both
ends; clicking a column header sorts ascending, clicking it again reverses
to descending, and the arrow/highlight reflects the active column; changing
any filter (Business Unit, Company, Business Goal, Year, Quarter) resets
back to page 1; editing a Rock's status or progress inline via the quick
controls does not jump the table back to page 1.

**Reports engine** (new `server/prisma/migrations/
20260721040000_add_reports_permission_resource/migration.sql` adding
`REPORTS` to the `PermissionResource` enum, `server/src/routes/reports.ts`,
updates to `server/src/utils/permissions.ts` and
`server/src/routes/customRoles.ts`'s resource list, and a new
`client/src/pages/Reports.tsx` wired into a `/reports` route and nav link)
adds a filterable, exportable "Reports" tab covering three report types:
Financial Performance (Target vs Actual per Company), Rocks (the full
filtered Rock list), and Executive Summary (a per-Business-Unit rollup of
both). Needs a fresh `npm run prisma:migrate` for the new `REPORTS`
permission value.
- **Access.** Follows the same pattern as the Executive Scorecard (not the
  stricter Audit Log pattern): Superadmin and Group Integrator can always
  open Reports; a BU Integrator (or blank-role user) needs a Custom Role
  that explicitly grants `REPORTS` view (a new row in Admin → Roles, right
  alongside Executive Scorecard and Audit Log). Once inside, the actual rows
  returned are still masked per the user's existing
  Revenue/Collections/Expenses/Rocks grants exactly like everywhere else —
  Reports is a different *shape* on the same data, never a way to see more
  of it than a Custom Role otherwise allows.
- **Design.** Every report type resolves to the same generic shape —
  `{ title, scope, columns, rows }` — so the frontend renders and exports
  any of them with one generic sortable + paginated (10/page, reusing the
  Rocks page's new `Pagination`/`SortableTh` components) preview table
  instead of bespoke UI per report. Filters: Year (required), Quarter
  (All/1-4), Business Unit, Company (Financial/Rocks only), and Business
  Goal + Status (Rocks only) — Executive Summary has no Company drill-down,
  matching the Scorecard it mirrors.
- **Export — important caveat.** This sandbox has no access to the npm
  registry, so true binary `.xlsx`/`.pdf` generation (which would need
  packages like `exceljs` or `pdfkit`) isn't available here. "Export to
  Excel" downloads a `.csv` file built client-side from the report's columns
  and rows (via a `Blob` + anchor-tag download) — this opens natively in
  Excel or Google Sheets, but is a CSV, not a true `.xlsx` workbook (no
  multiple sheets, cell formatting, or formulas). "Export to PDF" opens a
  new tab with a print-formatted HTML table and immediately calls the
  browser's native print dialog (`window.print()`) — choosing "Save as PDF"
  there produces the PDF; there's no server-side PDF file generated
  directly. Both buttons are labeled for what they actually do and both are
  disabled when a report has no rows. If true binary exports are needed
  later, that requires installing `exceljs`/`pdfkit` (or similar) via npm,
  which this sandbox currently cannot do.

**Business Goals: delete is Superadmin-only** (`server/src/routes/
businessGoals.ts`'s `DELETE /:id`, `client/src/pages/Rocks.tsx`) narrows who
can delete a Business Goal. Creating and editing a Business Goal is still a
Group Integrator + Superadmin action, same as before, but deleting one — a
destructive, taxonomy-wide action that untags every Rock using it across
every Business Unit — now requires the `SUPERADMIN` role specifically; a
Group Integrator (and every other base role) no longer sees the delete (X)
button in the "Manage Business Goals" list, and the backend rejects a
delete attempt from anyone else with a 403 even if attempted directly.
Worth checking by hand: a Group Integrator still sees and can use the Add
Business Goal form and the Edit (pencil) button, but no longer sees a delete
button next to any Business Goal; a Superadmin still sees and can use the
delete button as before.

**Rocks: click a row for details** (`client/src/pages/Rocks.tsx`) is a pure
frontend change — no schema/API changes. Clicking anywhere on a Rock's row
(other than its Status dropdown, Progress input, or Edit/Delete buttons,
which still work exactly as before) opens a read-only Details pop-up showing
the full Rock: title, Company/Quarter, Status badge, Progress bar, Owner,
Business Goal, the full (non-truncated) Target(s)/Remarks text, and
created/last-updated timestamps and by whom. An Edit button inside the
pop-up closes it and opens the existing Add/Edit Rock modal pre-filled for
that Rock, same as clicking its pencil icon directly. Same dismiss
affordances as the Add/Edit pop-up: its X button, its Close button, or
clicking the dimmed backdrop. Worth checking by hand: clicking a row's
Company/Quarter/Rock/Business Goal/Owner cells opens the Details pop-up;
clicking the Status dropdown, editing Progress, or clicking Edit/Delete on
that same row does NOT open the Details pop-up (those controls still work
immediately, in place); the Details pop-up shows the full Target(s)/Remarks
text even when the table's own preview was truncated by `line-clamp-2`; the
Edit button inside it correctly opens the pop-up form pre-filled for that
same Rock.

**Collapsible sidebar navigation** (`client/src/components/Layout.tsx`) replaces
the old top horizontal nav bar with a left sidebar on desktop (md+): a
collapse toggle at the bottom shrinks it to icon-only (tooltips via `title`
take over for labels) or expands it back to icon+label, and the choice is
remembered in `localStorage` across reloads. Below md, the sidebar becomes a
slide-in drawer opened by a hamburger button in a slim top bar, replacing the
old dropdown-under-the-header pattern. Purely a navigation-chrome change — no
new routes, no access-control changes; every existing link still points
where it always did. Worth checking by hand: toggling collapse/expand on
desktop shrinks/grows the sidebar smoothly and the choice survives a page
reload; every nav icon still shows a tooltip with its label while collapsed;
on a narrow viewport the hamburger opens a full-height drawer over the page
(with a dimmed backdrop) instead of a dropdown, and clicking a link or the
backdrop closes it.

**Disbursements** (new `PermissionResource.DISBURSEMENTS` value via
`server/prisma/migrations/20260722010000_add_disbursements_permission_resource`,
new `DisbursementActual` model via
`server/prisma/migrations/20260722020000_add_disbursement_actual`, new
`server/src/routes/disbursements.ts`, updates to `server/src/routes/
dashboard.ts` and `server/src/routes/scorecard.ts`, new `client/src/pages/
Disbursements.tsx`, new `client/src/components/DisbursementCards.tsx`, and a
new "Disbursements Summary" section in `client/src/pages/Scorecard.tsx`) adds
a fourth financial category alongside Revenue/Collections/Expenses: Advances,
Loans, and Interests, tracked per Company/Year/Quarter exactly like the
existing figures (split Internal/External, each with its own Remarks field).
Needs a fresh `npm run prisma:migrate` for both new migrations.
- **Recorded, not targeted.** Unlike Revenue/Collections/Expenses, there's no
  Target-side counterpart or attainment percentage for Disbursements — Target
  Setup is untouched. Each sub-category is just a running actual total for
  whatever period is in scope (respecting the Quarter filter's "All Quarters
  = sum of Q1-Q4" rule everywhere else already follows).
- **One combined DISBURSEMENTS permission**, not three. A Custom Role grants
  View/Edit/Delete for all three sub-categories together (same granularity as
  ROCKS), rather than Advances/Loans/Interests being independently gate-able
  the way Revenue/Collections/Expenses are. Default access follows the same
  Business-Unit scoping as the existing Data Entry page — a BU Integrator can
  record Disbursements for companies in their own assigned Business Unit(s);
  a Superadmin/Group Integrator can record for any company.
- **New nav section**: "Disbursements" in the sidebar expands to three
  sub-tabs — Advances, Loans, Interests — each its own page
  (`/disbursements/advances`, `/disbursements/loans`,
  `/disbursements/interests`) sharing one parameterized component
  (`Disbursements.tsx`) so adding a fourth sub-category later wouldn't need a
  new page, just a new route + prop. Each sub-tab's form only ever
  reads/writes its own category's Internal/External/Remarks fields — the
  other two categories on the same underlying row are left untouched.
- **New cards**: three new KPI cards (Advances/Loans/Interests actual, in
  purple/cyan/rose to stay visually distinct from the Revenue row's
  blue/emerald/amber) now render on the Revenue dashboard between the
  existing KPI cards and the quarterly Revenue-vs-Target chart, each
  abbreviated (K/M/B) with the full peso amount as a hover tooltip, same
  convention as every other currency figure in the app. The Executive
  Scorecard gained its own "Disbursements Summary" section (3 summary cards +
  a sortable per-Business-Unit table) using the same period/Business-Unit
  scope as its existing Revenue Performance Summary section.
- **Export note**: as with the Reports engine, this sandbox has no npm
  registry access, so nothing here needed new packages — Disbursements
  reuses the exact same figures/currency-formatting/permission machinery
  every other financial category already has.

Worth checking by hand: entering an Advances figure for a Company/Year/
Quarter under Disbursements → Advances, then switching to the Loan
Repayments sub-tab for the same scope, shows an empty form (not the Advances
figures) — switching back to Advances still shows what was just saved; the
Revenue
dashboard's new Advances/Loans/Interests cards update correctly when the
Year/Quarter/Business Unit/Company filter changes, hovering each shows the
full peso amount; the Executive Scorecard's new Disbursements Summary section
appears with correct per-Business-Unit sortable columns; a BU Integrator
with no Custom Role granting `DISBURSEMENTS` can still reach the
Disbursements sub-tabs and record figures for their own assigned Business
Unit(s) (default access, same as Data Entry) but is blocked (403) from
another Business Unit's companies; a Custom Role that grants `DISBURSEMENTS`
view for one specific Company (but no Revenue/Collections/Expenses grant at
all) still shows that Company's Disbursement figures on the Revenue
dashboard cards and Scorecard even when that Company has nothing else
visible on the rest of the Revenue dashboard.

Worth checking by hand: a BU Integrator with no Custom Role granting
`REPORTS` sees the "Reports access required" card when visiting `/reports`,
and a Custom Role with `REPORTS` view checked unlocks the page for them; a
Custom Role that also narrows, say, `COLLECTIONS` to one Company shows that
same narrowing in the Financial Performance report's Collections columns
(zeroed out for companies outside that grant); switching between the three
report tabs re-fetches and re-renders correctly, resetting to page 1 and
clearing the Company/Business Goal/Status filters when switching to
Executive Summary; clicking a column header sorts the preview table and
"Export to Excel" downloads a `.csv` that opens cleanly in Excel with the
same columns/row order currently sorted on screen; "Export to PDF" opens a
new tab showing a clean printable table with the report's title and active
filters listed at the top, and the browser's print dialog appears
automatically; a report with zero rows in scope shows "No data in this
scope" in the table and both export buttons are disabled.

**Sidebar collapse toggle made more discoverable + Loans renamed to "Loan
Repayments"** (`client/src/components/Layout.tsx`, `client/src/App.tsx`,
`client/src/components/DisbursementCards.tsx`, `client/src/pages/
Scorecard.tsx`) are two small follow-ups to the Disbursements + sidebar work
above. The collapse/expand control now also sits directly in the sidebar's
header row next to the logo (in addition to the full-width button at the
bottom, which is still there for the collapsed state) so it's visible
immediately rather than only after scrolling down past the nav list. The
"Loans" Disbursements sub-category is now labeled "Loan Repayments"
everywhere it's shown to a user — the sidebar sub-link, the
`/disbursements/loans` page's heading, the Revenue dashboard's KPI card, and
both the Scorecard's summary card and its per-Business-Unit table column.
The underlying category key (`LOANS`), API field names
(`loansInternal`/`loansExternal`/`loansRemarks`/`quarterLoansActual`), and
route path (`/disbursements/loans`) are unchanged — this is a display-label-
only rename. Worth checking by hand: the sidebar's collapse arrow next to
the logo is visible without scrolling and collapses the sidebar in one
click; every place that used to say "Loans" now says "Loan Repayments"
(sidebar sub-link, page heading, Revenue dashboard card, Scorecard card and
table column) while the URL and underlying data are unaffected.

**Scorecard: Disbursements cards repositioned above Revenue Trend**
(`client/src/pages/Scorecard.tsx`) moves the three Disbursements summary
cards (Advances/Loan Repayments/Interests) from their own section further
down the page to sit directly above the "Revenue Trend (Actual vs Target)"
chart, inside the Revenue Performance Summary section. The per-Business-Unit
Disbursements table that used to sit alongside those cards stays where it
was, in its own section now titled "Disbursements by Business Unit" (cards
removed from it, since they moved up). Worth checking by hand: the three
Disbursement cards appear right before the Revenue Trend chart, and the
"Disbursements by Business Unit" section further down still shows the
sortable per-BU table with no duplicate cards above it.

**New feature: side-by-side Comparison tab.** A new top-level nav item,
"Compare" (`client/src/pages/Compare.tsx`, routed at `/compare`), lets two
independent scopes be compared at once. Each side ("Period A"/"Period B")
gets its own Year/Quarter/Business Unit/Company picker (reusing the existing
`FilterBar` component — two separate instances, fully independent state) and
fetches its own snapshot of "everything" tracked on the Executive Scorecard:
Revenue/Collections/Expenses Target+Actual+attainment, Rocks status counts,
and Disbursements actuals. Unlike the Executive Scorecard (BU-level-only by
design), Comparison also supports drilling into one specific Company per
side, since each panel's scope is meant to be fully independent. The results
render as one table (Metric | Period A value | Change | Period B value),
grouped into Revenue/Collections/Expenses/Rocks/Disbursements sections, with
the middle "Change" column showing Period B minus Period A as a delta
(currency short-form, percentage points for attainment/progress metrics, or
plain count) plus a percent-change figure for currency/count metrics, each
with an up/down/flat arrow. A footnote clarifies the arrows/color indicate
direction only, not whether that direction is favorable (e.g. Expenses going
up isn't "good").

Backend: `server/src/routes/comparison.ts` (new) exposes a single endpoint,
`GET /api/comparison/snapshot?yearId=&quarter=&businessUnitId=&companyId=`,
returning one aggregated snapshot for that scope. It resolves the in-scope
Company list either directly (companyId given — verified via
`assertBusinessUnitAccess`) or via `scopedBusinessUnitFilter`, then applies
the same masking conventions used elsewhere: per-category `isCatAllowed()`
zeroing for Revenue/Collections/Expenses (each independently gate-able), and
two independently-derived company lists (`rockCompanies`/`disbCompanies`,
each filtered straight from the same raw, unfiltered company list — never
from one another) for the single-combined-grant ROCKS and DISBURSEMENTS
resources, mirroring `scorecard.ts`'s reference pattern rather than
`dashboard.ts`'s original (buggy, since-fixed) one. Access to the page itself
is gated the same way as the Executive Scorecard/Reports: Superadmin and
Group Integrator always have it; anyone else needs a Custom Role granting
`COMPARISON` view.

Permissions plumbing: a new `COMPARISON` value was added to the
`PermissionResource` enum (its own migration,
`20260723010000_add_comparison_permission_resource`, since Postgres forbids
using a new enum value in the same transaction that adds it), and wired
through `permissions.ts` (`Resource` type + `ALL_RESOURCES`, since Comparison
has its own Business Unit/Company filters like Scorecard/Reports/
Disbursements), `customRoles.ts`'s `resourceEnum`, `client/src/api/types.ts`,
and `AdminRoles.tsx`'s resource matrix (View-only — Comparison is read-only,
so Edit/Delete are ignored for it, same as Scorecard/Audit Log/Reports).

Worth checking by hand: opening `/compare` as Superadmin/Group Integrator
shows two independent filter bars and a comparison table once both sides
have a Year selected; changing Period A's Business Unit doesn't affect
Period B's own selection or data; picking a specific Company on one side
(not just a Business Unit) narrows that side's figures correctly; a
Custom-Role user with only `DISBURSEMENTS` (or only `ROCKS`) granted, and no
`COMPARISON` grant, gets a 403 "access required" card instead of the page;
a Custom-Role user granted `COMPARISON` view plus, say, only `DISBURSEMENTS`
(no Revenue/Collections/Expenses/Rocks) sees zeroed financial/Rocks rows but
correct Disbursements figures — not everything zeroed out.

**Disbursements entry folded into Data Entry — one tab instead of two.**
Disbursements (Advances/Loan Repayments/Interests) used to be their own
top-level sidebar tab with three separate sub-pages, each with its own
Year/Quarter/Business Unit/Company picker. They're now three more field
groups on the existing Data Entry page (`client/src/pages/
IntegratorPortal.tsx`), sharing the single scope picker already used for
Revenue/Collections/Expenses — an integrator now picks a Year/Quarter/
Business Unit/Company once and sees all six categories at once instead of
navigating between tabs and re-picking the same scope repeatedly. The
pre-fill effect now fetches both `api.actuals(...)` and `api.disbursements(...)`
together for the selected scope. The single "Save All Figures" button
submits everything at once: one `api.putActual(...)` call (Revenue/
Collections/Expenses together, as before) plus three `api.putDisbursement(...)`
calls, one per Disbursement category (the backend only ever accepts one
category per call — see `routes/disbursements.ts`). These four calls run via
`Promise.allSettled` rather than `Promise.all`, specifically because REVENUE/
COLLECTIONS/EXPENSES and DISBURSEMENTS are independently gate-able Custom
Role resources — a user with edit access to one but not the other should
still have the categories they ARE allowed to edit save successfully, with
only the disallowed ones reported as failures, rather than one 403 aborting
every category's save.

Removed: `client/src/pages/Disbursements.tsx` (the old shared component
behind the three `/disbursements/*` sub-pages), the three `/disbursements/*`
routes and their index-redirect in `App.tsx`, and the expandable
"Disbursements" nav group (plus its `disbOpen` state, the `ChevronDown`/
`Landmark` icons, and the `subLinkClass` helper and `useLocation` call that
existed only to support it) in `client/src/components/Layout.tsx`. No schema,
permissions, or API changes were needed — `DISBURSEMENTS` is still its own
Custom Role resource, `/api/disbursements` still accepts the same payload
shape, and the Revenue dashboard cards / Executive Scorecard / Comparison
tab are all unaffected (they only ever read Disbursement figures, never the
now-removed entry page). Worth checking by hand: `/data-entry` shows Revenue/
Collections/Expenses and Advances/Loan Repayments/Interests together under
one scope picker; changing Year/Quarter/Business Unit/Company reloads all
six categories' existing figures correctly; "Save All Figures" saves
everything in one click; the sidebar no longer has a separate Disbursements
entry; and visiting the old `/disbursements/advances` (etc.) URL directly no
longer resolves (falls through to the catch-all redirect to `/`).

**Sidebar: logo click toggles collapse/expand.** In `client/src/components/
Layout.tsx`, the EOS logo (and, when expanded, the "Executive Dashboard"
title next to it) in the desktop sidebar's header row is now itself a button
that flips `collapsed`, the same action as the dedicated chevron toggle
buttons — it's just the fastest thing to click since it's always the first
element in the sidebar, in both the collapsed (icon-only) and expanded
states. The existing explicit toggle buttons (the chevron next to the logo
when expanded, and the full-width button at the bottom of the sidebar) are
unchanged and still work exactly as before — this is an additional way to
collapse/expand, not a replacement. The mobile drawer's logo (a separate,
non-collapsible header) is untouched. Worth checking by hand: clicking the
logo in the desktop sidebar (both collapsed and expanded) toggles its width;
the existing chevron buttons still work too; the mobile drawer's logo is
still non-interactive (mobile has no collapse concept).

**Pagination moved above its table, everywhere.** The three tables with
pagination — Rocks (`client/src/pages/Rocks.tsx`), Reports
(`client/src/pages/Reports.tsx`), and the Audit Log
(`client/src/pages/admin/AdminAuditLog.tsx`) — now show their "Showing X-Y
of Z" caption and Prev/Next controls right above the table instead of below
it, so paging doesn't require scrolling past the whole table first. The
shared `Pagination` component (`client/src/components/Pagination.tsx`) had
its divider flipped from `border-t` to `border-b` to match sitting above the
table rather than below; the Audit Log's pagination footer (the one page
that didn't use the shared component, since it needed a full `border-b`
disclosure row rather than a compact bar) was moved the same way with the
same border flip. No behavior changed — same page state, same page size,
same Prev/Next logic — purely a layout reposition. Worth checking by hand:
Rocks, Reports, and the Audit Log all show their pager above the table, and
paging still works (Prev/Next disable at the ends, "Page X of Y" updates).

**Financials: Revenue renamed on the sidebar, Collections/Expenses broken
into real breakdowns, and the dashboard split into 4 sub-tabs.** A large,
four-part restructuring:

1. *Label-only rename.* The sidebar nav item is now "Financials" instead of
   "Revenue" (`client/src/components/Layout.tsx`). The URL is unchanged —
   still `/revenue` — per the decision to only rename what's displayed, not
   the route.
2. *Expenses collapsed to one breakdown set.* Expenses no longer has
   Internal/External — it's now three values: Interest, Depreciation, and
   Other Non-Cash Expenses (`expensesInterest`/`expensesDepreciation`/
   `expensesOtherNonCash`), each with its own Remarks field.
3. *Collections expanded to six values.* Both Internal and External now each
   break into Revenue - Earned, Advance Payments - Unearned, and Others
   (`collectionsInternalEarned`/`collectionsInternalUnearned`/
   `collectionsInternalOthers`/`collectionsExternalEarned`/
   `collectionsExternalUnearned`/`collectionsExternalOthers`), each with its
   own Remarks field — one Remarks field per breakdown, the same granularity
   Disbursements already used per category.
4. *Financials dashboard split into 4 sub-tabs.* What used to be one long
   page (`Dashboard.tsx`, showing Revenue + Collections + Expenses +
   Disbursements all at once) is now `client/src/pages/financials/
   FinancialsLayout.tsx` plus four real nested routes — `/revenue` (Revenue,
   the index route), `/revenue/collections`, `/revenue/expenses`, and
   `/revenue/disbursements` — each bookmarkable on its own. One shared
   `FilterBar` and one shared `api.dashboard(...)` fetch live in
   `FinancialsLayout`, passed down to each leaf tab via React Router's
   `Outlet` context (`useOutletContext<FinancialsOutletContext>()`) rather
   than each sub-tab fetching independently, per the decision that the
   Year/Quarter/Business Unit/Company filter should be shared across all
   four, not per-tab.

Schema/backend: `QuarterTarget` and `QuarterActual` in `schema.prisma` were
rewritten to the new 11-figure shape (2 Revenue + 6 Collections + 3
Expenses), with `QuarterActual` also carrying the matching 10 Remarks
fields (Revenue keeps its original single `revenueRemarks`). This is a
**destructive** migration (`server/prisma/migrations/
20260724010000_restructure_collections_expenses_breakdown/migration.sql`) —
the old combined Collections/Expenses Internal/External figures cannot be
principled-ly split into the new breakdown, so existing values in those
columns are dropped, not migrated. `server/src/utils/aggregate.ts`'s
`Figures` interface (the single source of truth for financial shape,
consumed by nearly every route that touches money) was rewritten to match,
and `collectionsInternalTotal`/`collectionsExternalTotal` helpers were
added alongside the existing `collectionsTotal`/`expensesTotal`. `targets.ts`
and `actuals.ts` had their zod schemas and field-permission maps updated to
the new field names; the Annual→Quarter cascade logic in `targets.ts` needed
no changes at all, since it iterates generically over a `FIGURE_KEYS` list
rather than caring what each key represents. `dashboard.ts` gained genuinely
new BU-level Collections/Expenses rollups (`collectionsQuarterTarget`/
`collectionsQuarterActual`/`collectionsAttainmentPct` and the Expenses
equivalents) and matching top-level KPI fields
(`quarterCollectionsActual`/`collectionsAttainmentPct`/
`quarterExpensesActual`/`expensesAttainmentPct`) — previously only Revenue
had a real Quarter Actual + Attainment figure; Collections/Expenses only had
Target totals. `scorecard.ts`, `comparison.ts`, `reports.ts`, and `seed.ts`
needed **no changes** — verified by grep that none of them reference the old
field names directly, since they only ever go through the generic
`Figures`/aggregate.ts total functions.

Frontend: `client/src/api/types.ts` and `client.ts` were updated to the new
shape. `TargetConfig.tsx` (Target Setup) keeps its existing "One Total" vs
"Internal / External" toggle only for Revenue (the only category that still
fits that shape); Collections and Expenses each got a new, always-expanded
editor component (`CollectionsFieldsEditor`, `ExpensesFieldsEditor`) with no
toggle, since Collections now has 3 sub-values per side and Expenses has no
Internal/External at all. `IntegratorPortal.tsx` (Data Entry) got the same
treatment — Collections renders as two cards ("Collections — Internal" /
"Collections — External"), each with 3 breakdown items; Expenses renders as
one card with 3 breakdown items; each breakdown item is its own numeric
input + Remarks input pair. The Disbursements section of that same page was
left untouched. `OperationalGrid.tsx` gained a `category` prop
("REVENUE"/"COLLECTIONS"/"EXPENSES", defaulting to "REVENUE") controlling
both which BU-headline columns show (Revenue keeps its full Annual/Quarter/
YTD headline; Collections/Expenses show only Quarter Target/Actual/
Attainment, since they have no Annual/YTD rollup) and which per-company
breakdown fields + Remarks inputs render in the expanded detail row.
`TargetMatrix.tsx` gained an optional `category` prop to show just one
category's row per Business Unit (used by each Financials sub-tab) instead
of all three at once. `KpiCards.tsx` was reworked into a category-aware
component — Revenue shows Annual + Quarter Target + Quarter Actual (with
attainment) + Year-to-Date Actual cards; Collections/Expenses show the same
three non-YTD cards only, since neither has a YTD figure.

Removed: `client/src/pages/Dashboard.tsx` (replaced by the `financials/`
sub-tab structure above).

Worth checking by hand, given the size and destructive nature of this
change: the sidebar says "Financials" (not "Revenue") but the URL is still
`/revenue`; visiting `/revenue`, `/revenue/collections`, `/revenue/expenses`,
and `/revenue/disbursements` each load a distinct, narrower page rather than
one long combined page, and each is directly bookmarkable/refreshable;
changing the Year/Quarter/Business Unit/Company filter on any one sub-tab
and switching to another sub-tab keeps the same filter selection (confirming
the shared FilterBar); Target Setup's Collections section shows 2 sub-cards
(Internal/External) each with 3 fields, and its Expenses section shows 1
card with 3 fields and no Internal/External split; Data Entry's Collections/
Expenses sections match the same shape and each breakdown has its own
Remarks box; the Operational Grid's expanded per-company detail on the
Collections and Expenses sub-tabs shows the correct 6 and 3 breakdown values
(respectively) instead of a generic Internal/External pair; a Custom Role
with only `COLLECTIONS` (not `EXPENSES` or `REVENUE`) granted can still open
`/revenue/collections` and see real figures there, while the other two
sub-tabs correctly show zeroed/masked data; and since this migration is
destructive, confirm on a fresh seed/migrate that Collections and Expenses
figures all start at 0 rather than carrying over any old Internal/External
values from before the schema change.

**Scorecard: new Net Income headline card.** The Executive Scorecard's
top-line traffic-light row (`client/src/pages/Scorecard.tsx`) now shows
three cards instead of two: Revenue Attainment, a new Net Income card, and
Rocks Completion. Net Income = Total Revenue (Actual) − Total Expenses
(Actual) for whatever scope (a specific Quarter or "All Quarters"/full year)
is selected. `server/src/routes/scorecard.ts` previously only tracked an
Expenses *Target* total, never an Expenses *Actual* total, so it gained a new
`quarterExpensesActualTotal` accumulator (summed the same way as every other
figure in that route, gated by the same `EXPENSES` Custom Role visibility
check) and now returns both `quarterExpensesActual` and `netIncome` on
`revenue.kpis`. Net Income has no natural "Target" to attain against (there's
no Net Income Target concept anywhere in the schema), so rather than reuse
`HeadlineCard`'s attainment-badge/progress-bar framing, it's a new
`NetIncomeCard` component: a Profit/Loss badge (green/red) and a net margin
percentage (Net Income ÷ Total Revenue) shown in place of a progress bar. If
a Custom Role has Revenue visibility but not Expenses (or vice versa), Net
Income reflects only whichever side is visible — the masked side already
contributes 0, same masking convention used everywhere else on this page.
Worth checking by hand: the new card sits between Revenue Attainment and
Rocks Completion; it turns red and says "Loss" when Expenses exceed Revenue
for the scope; switching Quarter/"All Quarters"/Business Unit updates it
along with the other two cards; and a Custom Role granted only `COLLECTIONS`
(no `REVENUE` or `EXPENSES`) sees a ₱0 Net Income card rather than an error.

**Collections/Expenses Operational Grid: cleaner per-company breakdown
layout.** The expanded per-company detail row on the Collections and
Expenses Financials sub-tabs (`client/src/components/OperationalGrid.tsx`)
was showing all of a company's breakdown values in one grid, then all of its
Remarks boxes in a second, separate grid below — nothing tied a given
Remarks box back to the value it was about, which felt cluttered,
especially for Collections' 6 values. Each breakdown value is now paired
directly with its own Remarks box immediately underneath it, inside a
labeled card: Collections shows two side-by-side cards ("Collections —
Internal" / "Collections — External", tinted emerald to match the
Collections color used elsewhere), each with its 3 breakdown rows
(value + Remarks stacked); Expenses shows one amber-tinted card with its 3
breakdown rows laid out in columns on wider screens. `RemarksInput`'s
`label` prop is now optional — omitted here since the breakdown's own label
already sits directly above the box, so it's not repeated. The
"select a quarter to view/edit Remarks" note (shown when "All Quarters" is
selected) now appears per-breakdown-row instead of as one block at the
bottom, consistent with the new paired layout. Revenue's detail row and the
BU-headline table above are unchanged. Worth checking by hand: on the
Collections sub-tab, expanding a Business Unit shows two clearly separated
Internal/External cards, each value sitting right above its own Remarks
box; typing in a Remarks box and clicking away still saves it (same
`patchRemarks` call as before); switching to "All Quarters" replaces each
Remarks box with the "select a quarter" note instead of hiding all of them
at once; and the Expenses sub-tab's single card lays its 3 items out in
columns on a wide screen and stacks them on mobile.

**Financials Revenue tab: KPI cards rearranged into a 2x2 grid.**
`client/src/components/KpiCards.tsx`'s Revenue layout changed from a row of
3 cards followed by a lone Year-to-Date card, to a proper 2x2: Annual
Revenue Target next to Year-to-Date Actual on top, Quarter Target next to
Quarter Actual underneath. Collections/Expenses are unaffected — they still
show their single row of 3 cards, since neither has a Year-to-Date figure to
pair with a 4th card.

**Light/dark theme toggle, high-contrast in both modes.** The whole app now
supports a dark theme, toggled from a sun/moon button in the header
(`client/src/components/Layout.tsx`, next to the profile icon) and, since
that header only exists once someone's signed in, a matching button in the
top-right corner of the Login page too (`client/src/pages/Login.tsx`) so
the theme is reachable before login as well.

`client/tailwind.config.js` now sets `darkMode: "class"` — every `dark:`
utility in the app is keyed off a `dark` class on `<html>`, toggled by a new
`ThemeProvider`/`useTheme()` context (`client/src/contexts/ThemeContext.tsx`,
wired into `main.tsx`). The choice persists in `localStorage`
(`eos_theme`) so it survives reloads; on a person's very first visit, with
nothing saved yet, it defaults to their OS-level `prefers-color-scheme`
instead of always opening light. `index.css` also sets `color-scheme: dark`
on `.dark` so the browser's own native chrome — scrollbars, checkboxes, date
pickers, autofill — follows suit instead of staying stuck light.

Since the app's color classes (`bg-white`, `border-slate-200`,
`text-slate-500`, the tone-card families like `bg-emerald-50`/`text-amber-700`,
etc.) are the same handful of recurring Tailwind tokens repeated across every
page and component, adding `dark:` variants file-by-file wasn't practical —
instead, every occurrence of ~70 recurring class tokens across all 34
`.tsx` files was mapped to a matching dark-mode variant and applied in one
pass (verified before and after with a balance/paren check across every
file). The mapping was built for contrast, not just "make it dark": page
background → `slate-950`, card surfaces → `slate-900`, subtle
hover/secondary fills → `slate-800`/`slate-700`, body text → `slate-100`
down to `slate-400` depending on original weight, and every tinted
badge/card family (blue/emerald/amber/red/purple/cyan/rose/orange/green)
got a `-950/40`-ish tinted dark background with a `-300`/`-400` text shade
that reads clearly against it. Form inputs specifically (anywhere
`border-slate-300` was used, ~108 spots) also picked up an explicit
`dark:bg-slate-800 dark:text-slate-100`, since browser-default white input
backgrounds would otherwise stay white-on-white-adjacent even inside a dark
card. The `brand` blue in `tailwind.config.js` gained new `200`/`300`/`400`/
`800`/`900` shades (previously only `50`/`100`/`500`/`600`/`700` existed) so
brand-colored text/borders/badges have a legible dark-mode variant instead
of reusing the same shade meant for a light background.

Two spots use hardcoded hex colors instead of Tailwind classes and so
couldn't be covered by the bulk pass: the Revenue Trend charts in
`ProgressChart.tsx` and `Scorecard.tsx` pass raw hex strings to recharts'
`CartesianGrid`/`XAxis`/`YAxis` as SVG attributes, which `dark:` variants
can't reach. Both now read `useTheme()` and pick a grid/tick color directly
(`#e2e8f0`/`#64748b` in light, `#334155`/`#94a3b8` in dark) so the chart grid
and axis labels stay visible on a dark card instead of nearly disappearing.
Worth checking by hand: toggling the header button (and the Login page's)
flips the whole app between themes instantly with no reload; every page —
Scorecard, Financials' 4 sub-tabs, Rocks (including its modals), Reports,
Compare, Data Entry, Target Setup, every Admin page, Profile, Login, Change
Password — reads clearly in dark mode, including status badges, table
headers/hover rows, and form inputs; the Revenue Trend chart's grid lines
and axis labels are still visible (not just the bars/lines) after switching
to dark; and the choice survives a full page reload.

**Target Setup: Collections/Expenses can be entered as one total, split
evenly across their 3 breakdowns.** Collections Internal, Collections
External, and Expenses each gained their own independent "One Total" vs
"Split" toggle in `client/src/pages/TargetConfig.tsx` — the same idea as
Revenue's existing Combined/Split toggle, but with a different mechanic:
Revenue's "Combined" just dumps the whole figure into Internal and zeroes
External, whereas here entering One Total for, say, Collections Internal
splits that amount evenly across its 3 breakdowns (Revenue - Earned /
Advance Payments - Unearned / Others) so all 3 contribute an equal share of
the target — same for Collections External (its own 3 breakdowns) and for
Expenses (Interest / Depreciation / Other Non-Cash Expenses). A new shared
`ThreeWayFieldGroup` component (replacing the previous always-split-only
rendering) handles this for both `CollectionsFieldsEditor` and
`ExpensesFieldsEditor`, reused by both the per-Quarter form and the Annual
Target form. The split uses a `splitEvenlyThree()` helper that always sums
back to exactly the entered total (the third share absorbs whatever
rounding the first two picked up, so ₱100 splits to 33.33/33.33/33.34
rather than losing or gaining a cent). Switching from Split to One Total
re-normalizes whatever the 3 fields currently hold into equal thirds of
their sum; switching back to Split just makes them individually editable
again without changing their values. Which mode a group opens in is
inferred from its saved data — if the 3 values are exactly equal (which is
what One Total always produces, including all-zero/blank) it opens as One
Total, otherwise as Split, so previously-entered uneven breakdowns aren't
silently flattened. This only affects Target Setup — Data Entry
(`IntegratorPortal.tsx`) is unchanged, since actual recognized Collections/
Expenses figures are real, independent amounts that shouldn't be assumed
equal. Worth checking by hand: entering a Collections Internal Total of
900 and saving shows 300/300/300 across the 3 breakdowns in Split view
afterward; toggling Split→One Total on a group with uneven values (e.g.
500/200/100) collapses it to a One Total input showing 800, and toggling
back to Split shows the normalized 266.67/266.67/266.66 rather than the
original 500/200/100; the same behavior works independently for Collections
External and for Expenses; and it works the same way in both the "Set by
Quarter" and "Set Annual Target" forms.

**Target Setup: bulk upload Quarter Targets from a CSV/Excel file.** A
"Bulk Upload (CSV/Excel)" button next to the Set by Quarter / Set Annual
Target toggle in `client/src/pages/TargetConfig.tsx` opens a new
`client/src/components/BulkTargetUpload.tsx` modal. It parses a `.csv`/
`.xlsx`/`.xls` file entirely in the browser (via the new `xlsx` (SheetJS)
dependency added to `client/package.json` — run `npm install` in `client/`
to pick it up) into rows, so no file ever reaches the server; only the
parsed JSON rows are posted. A "Download Template" button generates a
starter `.xlsx` with the expected columns (Business Unit, Company, Quarter,
plus all 11 figure columns) and two example rows. Column headers are
matched flexibly — "Revenue - Internal", "Revenue Internal", and
`revenueInternal` all resolve to the same field, since matching strips
everything but letters/digits before comparing — so reasonable header
variations aren't rejected. One file can mix any Companies and any
Quarters (even all 4 quarters for several Companies), since each row
carries its own Quarter; blank figure cells default to 0.

On the server, `server/src/routes/targets.ts` gained `POST
/targets/quarter/bulk`: the existing cascade-upsert logic from `PUT
/quarter` (redistribute the delta across a Company's subsequent quarters so
its Q1-Q4 sum doesn't drift) was extracted into a shared
`upsertQuarterTarget()` function used by both routes. Each row identifies
its Company by name — optionally narrowed by a Business Unit name — rather
than by id, since names are what's practical to type into a spreadsheet
(Company names are only unique *within* a Business Unit, so an ambiguous
match without a Business Unit column is reported as an error rather than
guessed at). Rows are processed one at a time, not as a single all-or-
nothing transaction, so one bad row (unknown Company, ambiguous name, a
manually-locked quarter, no Custom-Role permission on that Company) doesn't
block the rows around it — the response carries a per-row
`{row, status, error?}` result, which the modal's preview table displays
against each spreadsheet line number (an optional `sourceRow` passthrough
field keeps that numbering correct even though the frontend filters out
client-detected bad rows — missing Company/invalid Quarter — before
submitting). A single summary `TARGET_QUARTER_BULK_UPDATE` Audit Log entry
is written per upload (not one per row). Worth checking by hand: uploading
the downloaded template (after filling in a real Company name) sets that
Company's Q1/Q2 targets and shows "Saved" per row; a row with an unknown
Company name or an out-of-range Quarter shows its specific error without
blocking the other rows; a Company name that exists in two different
Business Units is rejected as ambiguous unless the Business Unit column is
filled in; uploading against a manually-locked quarter reports that row as
locked rather than silently skipping it; and a BU Integrator (or Custom-
Role-scoped user) uploading a file that includes a Company outside their
access gets a permission error on just that row.
