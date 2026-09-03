# Build Play Contracting — Playground Estimating System

Turns a manufacturer playground quote into a defensible installation price, and
turns finished jobs back into better estimates.

The formula is not the asset. The asset is the structured history connecting
components, install requirements, labor, equipment, materials, site conditions,
estimates and what the job actually cost. This app is built around collecting
that history from the first estimate.

Runs two ways: as a normal web app (`npm run dev`, or deployed behind Docker),
or as an installable **desktop application** with its own window and a local
database that needs nothing else installed — see [Desktop
application](#desktop-application) below.

---

## Getting started

```bash
bash scripts/setup.sh     # installs, starts MongoDB, seeds a demo dataset
npm run dev               # http://localhost:3000
```

Sign in as `admin@buildplay.local` / `changeme-please-1`, then change the
password under Settings.

If you would rather do it by hand:

```bash
cp .env.example .env.local        # set AUTH_SECRET to 32+ random characters
npm install
npm run db:up                     # docker compose up -d
npm run seed                      # or: npm run seed:reset to wipe first
npm run dev
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Estimating-math test suite (no database needed) |
| `npm run typecheck` | TypeScript across the whole project |
| `npm run seed` / `npm run seed:reset` | Seed data, additively or from scratch |
| `npm run db:up` / `npm run db:down` | Start and stop the local MongoDB container |
| `npm run electron:dev` | Desktop window pointed at `npm run dev` (run both) |
| `npm run electron:build` | Build the installer — see [Desktop application](#desktop-application) |

> **Every rate the seed installs is a placeholder.** Wages, workers-comp
> percentages, rental prices, material prices, overhead, contingency, the
> mobilization rates and all the site-factor percentages are starting guesses,
> flagged as such on each record. Replace them under **Settings** and
> **Master data** before an estimate goes to a customer.

---

## Desktop application

For everyday use by someone who is not going to run `docker compose` or open a
terminal: an installer that puts a real, frameless, Windows-98-styled app on
the desktop. No Docker, no separately installed MongoDB, no browser tab —
double-click the icon, the app opens in its own window.

```bash
npm run electron:build      # builds the installer for whatever OS you run this on
```

The installer lands in `release/` (a `.exe` on Windows, `.dmg` on macOS, an
`AppImage` on Linux — `electron-builder` cross-compiles some combinations, but
building on the target OS is the reliable way to do it). Install it and open
it like any other application.

**What happens on first launch:** the app downloads a real copy of `mongod`
(MongoDB's own server binary — this is a genuine, persistent database, not an
in-memory one) and starts it against a database folder inside the app's own
per-user data directory. That download is one time only (cached for every
future launch) and needs an internet connection; after that, the app starts in
a couple of seconds fully offline. The very first startup also runs the same
automatic seed the dev workflow runs by hand (see `src/instrumentation.ts`),
so there is an admin login and starting reference data immediately —
`admin@buildplay.local` / `changeme-please-1`, same as the web version.

**Where the data lives** (back it up from here):

| OS | Location |
| --- | --- |
| Windows | `%APPDATA%\Build Play Estimating\database\` |
| macOS | `~/Library/Application Support/Build Play Estimating/database/` |
| Linux | `~/.config/Build Play Estimating/database/` |

**Developing the desktop shell** — the packaged build above is for producing a
real installer; day to day it is faster to point a plain Electron window at
the dev server you already have running, using the same local MongoDB as
everything else:

```bash
npm run dev              # terminal 1 — the usual dev server, port 3000
npm run electron:dev     # terminal 2 — opens a frameless window pointed at it
```

This mode manages nothing: no database, no bundled server — it is only the
window and the title bar, so editing `electron/*.js` and reloading (`Ctrl+R` /
`Cmd+R`, or `Ctrl+Shift+I` for dev tools) is immediate.

A few things worth knowing about how it is put together:

- **The window is frameless.** There is no OS title bar; `ElectronTitleBar.tsx`
  renders the whole title bar/drag region/minimize/maximize/close buttons
  itself (in the same retro style as everything else), and sits above every
  page — including the login screen — so the window is always movable and
  closable. It renders nothing at all in a plain browser tab.
- **The Electron process and the web app do not share a `node_modules`.**
  `electron/` has its own tiny `package.json` (just `mongodb-memory-server-core`,
  used only to locate/download the `mongod` binary) so packaging the desktop
  app doesn't also bundle a second copy of Next.js/React/Mongoose — those
  already travel separately inside the standalone server build.
- **One instance only.** A second launch while the app is already open just
  focuses the existing window rather than starting a second database on top
  of the first.
- **A prerequisite:** `next.config.ts` sets `output: "standalone"`, which
  `npm run electron:build` relies on (via `scripts/prepare-standalone.js`, which
  copies the static assets the standalone build doesn't include by default).
  This has no effect on `next dev` and does not change the Docker/web
  deployment path other than making its own build output smaller.
- **No custom icon is bundled yet** — see `build/README.md` for where to drop
  one; without it the installer uses Electron's default icon, which is
  harmless but generic.

---

## How the estimate is calculated

Costs are built in layers, not in one formula, so a number that looks wrong can
be traced to the layer that produced it.

**1 · Normalize the playground.** A preset model explodes into its components; a
custom structure is assembled from the library. Out comes one object: weight,
footing count, concrete volume, published labor hours, safety-zone area.

**2 · Work out what the job needs.** Install hours, concrete method and volume,
material quantities, equipment, rental durations, crew size — then site
conditions are applied to the categories they actually affect.

**3 · Cost it directly.**

```
laborCost     = adjusted man-hours x fully burdened rate
materialCost  = Σ (quantity x site factor x (1 + waste) x unit cost) + fees
rentalCost    = Σ (cheapest vendor for the duration + delivery + pickup + fees)
equipmentCost = owned machines at their internal rate + fuel
mobilization  = max(minimum, miles + haul-weight surcharge + paid crew travel)
consumables   = labor cost x consumables %
salesTax      = taxable purchases x TPT %          (a cost, never billed on)
directCost    = the sum of all of the above
```

**4 · Add overhead and contingency**, each a percentage of direct cost.

**5 · Turn cost into price** at a gross margin:

```
sellingPrice = totalCost / (1 - grossMargin)
```

This is margin pricing, not markup. At a 30% margin you divide by 0.70, which is
a 42.9% markup — quoting "cost plus 30%" instead leaves you at a 23% margin.
Three prices come out of the same cost: **minimum** (the floor, 30%),
**competitive** (a bid you expect to fight for), and **target** (what you want).

### Things worth knowing about the engine

- **All labor is man-hours**, not crew-hours. Manufacturer figures are published
  that way, and it keeps the labor rate a simple per-person cost. Crew size is
  used only for job duration and for how many bodies travel.
- **Rental days are not job duration.** A telehandler on site for two days of a
  three-week job is two days. It is always an input.
- **Multiple vendors per machine.** The engine prices every rate on file for the
  duration — including switching to a weekly rate when that is cheaper — and
  picks the cheapest. The comparison is internal; the customer sees
  "telehandler, 2 days". `GET /api/rentals/compare` shows the full comparison.
- **Concrete picks its own supply method.** At or under the hand-mix threshold it
  buys bags and charges hand-mixing labor; above it, ready-mix with delivery and
  the plant minimum. The estimate says which and why.
- **Owned equipment is not free.** The T66, the F450 and the trailer are charged
  to the job at internal rates, and their weight decides how many mobilization
  trips are needed against the trailer's capacity.
- **Overhead is charged once.** It is a percentage of direct cost at the estimate
  level, which is why the labor-rate burden has an "overhead allocation" field
  that defaults to zero. Filling in both charges for the office twice.
- **Every line explains itself.** Click any line item to see its inputs, its
  formula, and which master record it came from.

### Site conditions are rated, not ticked

"Difficult access" as a yes/no cannot tell the difference between parking thirty
feet away and wheelbarrowing engineered wood fibre four hundred feet around a
building. So each condition is scored — **1** as good as it gets, **5** a normal
job, **10** the worst you have seen — and each rating drives a multiplier on the
specific costs it affects. A long carry is a nuisance for bolting decks together
(+3%/point) and a disaster for surfacing labor (+9%/point). Conditions that hit
the same work compound.

Site factors are fully editable under **Master data → Site factors**: the scale,
what each rating means, which costs it touches, and by how much.

---

## Reference data versus estimate snapshots

Changing master data must never rewrite a quote you already sent.

| Master data (changes freely) | Estimate snapshot (frozen) |
| --- | --- |
| A component's current labor assumption | The hours actually used on this quote |
| Today's rental rate | The rate used when the quote was calculated |
| Today's labor rate | The burdened rate used on this quote |
| Today's concrete price | The concrete price used on this quote |
| The current site factors | The multipliers this estimate applied |

When an estimate is calculated, every input is copied onto it. Sending an
estimate locks it; the only way forward is a revision, which recalculates the
same *recipe* against today's rates and gets a new version number
(`BPC-E26-42` → `BPC-E26-42-R2`). The original stays exactly as the customer
received it.

---

## Project layout

```
src/
  models/        Mongoose schemas — data only
  services/      All calculation. estimatingEngine.ts is the entry point.
                 seedService.ts is the seed logic (CLI and auto-seed share it).
  app/api/       REST endpoints
  app/(app)/     Screens (the app shell, behind sign-in)
  components/    UI, including the estimate builder
  lib/           money (integer cents), units, auth, db, shared enums
  instrumentation.ts   runs the seed automatically on every server boot
electron/        The desktop app shell (main.js, preload.js) — see
                 "Desktop application" above. Its own package.json/node_modules,
                 independent of the web app's.
seed/            CLI wrapper around src/services/seedService.ts
tests/           Estimating-math tests — pure functions, no database
```

Models store data, services calculate, routes handle requests, components
display. The engine takes plain objects and returns plain objects, which is why
the whole of the estimating maths is testable without a database — `npm test`
runs 70+ assertions in under a second.

### Money

Every currency value is an **integer number of cents**, everywhere: database,
services, API. Floating-point dollars drift (`0.1 + 0.2 !== 0.3`), and on an
estimate with a few hundred lines that drift becomes totals that do not foot.
Only the display layer sees dollars.

---

## Users and roles

| Role | Can do |
| --- | --- |
| **admin** | Everything: rates, rules, margins, settings, users; can send a below-floor estimate |
| **estimator** | Projects and estimates, read master data, add customers/components |
| **viewer** | Read only |

Sending an estimate priced below the hard-floor margin requires an admin.

---

## Importing your catalogue

**Import** takes a CSV per manufacturer. Headers are matched case- and
space-insensitively, a re-run updates rather than duplicates (matched on
manufacturer + part number), and rows it cannot take are listed instead of
failing the file. Blank templates download from the same screen.

Components: `partNumber, name, category, subcategory, description, weightLb,
baseLaborHours, footingCount, concreteCuFt, complexity, tags, notes`. Only part
number and name are required.

**Leave `baseLaborHours` blank for parts you have not actually timed.** The
estimator will infer hours from weight and category and flag every estimate that
leans on a guess, and the dashboard tracks what proportion of the library is
verified. That number going up is the system getting better.

---

## What is built, and what is next

Built (phases 1–3 of the schema document's build order, plus parts of 4):

- All master data: manufacturers, vendors, customers, components, presets,
  equipment, rental rates, labor rates, materials, subcontractor rates, site factors
- Projects with rated site conditions and scope
- The estimating engine, with live pricing as you build an estimate
- Auditable line items, three-tier pricing, versioning and send-locking
- CSV import, a printable customer estimate, dashboard, users and roles

Stubbed behind working interfaces, ready for the next phase:

- **Estimating rules** (`estimatingRules`) — the model, the condition evaluator
  and the editor exist; the engine currently applies requirement rules only.
- **Quote parsing** (`quoteParserService.ts`) — the interface, the source-document
  store and the upload path exist. No parser is written yet: the manufacturers
  each lay their quotes out differently, and one written against a guess rather
  than against real documents would have to be thrown away.
- **Jobs, actuals and variance** (`Job`, `varianceService.ts`) — the model and the
  variance maths are in place so actuals can be collected from the first job
  rather than reconstructed later from memory.

The long-term point of the jobs collection: knowing that 43.3 estimated hours
became 51 is worth more than knowing the job made money, because it tells you
which assumption was wrong.
