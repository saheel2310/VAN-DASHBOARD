# VAN Payment Dashboard

React (Vite) frontend + Node.js/Express backend + PostgreSQL.

```
Excel upload → backend validates & parses (in memory) → PostgreSQL transaction → dashboard APIs → React
```

**PostgreSQL is the only source of truth.** Uploaded Excel files are an input format only: they are parsed from memory during the request and never written to disk or kept as application data. Only the file name is recorded, as metadata in the `uploads` table. The backend can be restarted or redeployed on ephemeral storage without losing data.

## 1. PostgreSQL setup

Install PostgreSQL 14+ (tested with 17) and make sure it is running. You need a user that can create a database (e.g. the default `postgres` user), or an existing empty database.

## 2. Configure `DATABASE_URL`

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/van_dashboard
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

| Variable       | Purpose                                                       |
|----------------|---------------------------------------------------------------|
| `DATABASE_URL` | PostgreSQL connection string (required)                       |
| `PORT`         | Backend port (default `3001`)                                 |
| `CORS_ORIGIN`  | Allowed frontend origin(s), comma-separated                   |

Never commit `backend/.env`; it is git-ignored.

## 3. Install and migrate

```bash
npm install                # root (concurrently)
npm run install:all        # frontend + backend dependencies
npm run migrate            # creates the database if missing, then applies db/migrations/*.sql
```

`npm run migrate` is safe to re-run; applied migrations are tracked in `schema_migrations`. The initial database is empty — there is no seed or demo data.

## 4. Run

```bash
npm run dev                # backend on :3001 and frontend on :5173 together
```

Or separately: `npm run backend` and `npm run frontend`. Open http://localhost:5173.

On startup the backend logs `PostgreSQL connected.` or a hint explaining what is wrong (wrong password, database missing, migrations not run).

## 5. Excel upload format

In the app choose the **Year** and the Excel file. The file is checked straight away (nothing is saved yet) and the months found in its VAN usage column names are shown as checkboxes, all ticked, with months already in the database marked *already uploaded*. Untick any month you don't want, then click **Upload Excel** — only the ticked months are imported. The file name is never used to decide the period.

Required columns (header matching ignores case, extra spaces and `_` / `-` vs space; column order doesn't matter):

- `PARTY CODE` (must be filled in on every row and unique within the file)
- `PARTY NAME`, `Sales Representative Name`, `Group Head`, `Regional Head`
- `category_frequency_purchase`, `pay terms`
- at least one VAN usage column for the selected year, e.g. `VAN_Usage_APR_26`, `VAN_Usage_MAY_26` for 2026. Variants such as `VAN Usage Aug 26`, `VAN_Usage_August_2026` or `VAN_Usage_AUG` (no year) are accepted.

VAN usage columns for a different year (e.g. `_25` when uploading 2026) are ignored and listed in the response; if the file has none for the selected year, the upload is rejected. Two columns for the same month (e.g. `VAN_Usage_APR_26` and `VAN Usage April 2026`) are rejected as ambiguous.

Optional, stored when present: `nos` (must be numeric), `van nos`, `Months VAN Used (0-4)`, `VAN Status`, `Conversion Wave`, `VAN NO`, `UPI`.

### How an upload changes the data

Each party is stored **once per year**; a month's VAN usage goes into that month's column in the party's row. The file is the **complete snapshot for every month you import**. In one transaction:

1. Each imported month is set to `No` for **every** party already stored for that year.
2. Each party in the file is matched on `(reporting_year, party_code)`:
   - **existing party** → the imported months' VAN usage is updated from the file; master fields (name, sales rep, group head, regional head, category, pay terms, …) are refreshed. Other months are never touched.
   - **new party** → a new row; the imported months get the uploaded values and every other month is `No`.
3. One `uploads` row is added for the file, listing the months imported.

If anything fails (bad file, missing columns, empty or duplicate PARTY CODE, database error) the whole upload is rolled back and nothing changes. The response reports `months`, `totalRows`, `newParties`, `updatedParties`, `resetToNo` (stored parties not in the file, now `No` for those months) and `ignoredColumns`.

Consequences of storing one row per party per year:

- Master fields hold the **latest** uploaded values, so earlier months are reported with the current category, pay terms and sales hierarchy.
- A party first seen in a later month counts as `No` (Not Using VAN) in the months uploaded before it.

## 6. Business rules

For each party in a month, only that month's VAN usage column is used (`van nos` is never used):

| VAN usage value                         | Classification                                                                 |
|-----------------------------------------|--------------------------------------------------------------------------------|
| `No` (trimmed, any case)                | Not Using VAN                                                                   |
| up to 7 letters/digits `^[A-Za-z0-9]{1,7}$` (e.g. `AB123`, `AB1234`, `AB12345`) | Using VAN → pay terms `Credit` → Credit; `100% adv` / `100% advance` → 100% Advance; otherwise Other |
| anything else (blank, `Yes`, 8+ characters, spaces or symbols, …) | Invalid / Missing VAN Usage                                         |

- An empty VAN usage cell for a party that *is* in the file is Invalid / Missing; a party *missing* from the file is `No`.
- Counts are **distinct parties** (`PARTY CODE`), never raw rows.
- A month uses its own column (April → `van_usage_apr`, August → `van_usage_aug`, …).
- **All Months** counts each party **once**, across the uploaded months: *Using VAN* if it has a valid VAN code in any month (Credit / 100% Advance / Other from its pay terms), *Not Using VAN* if it is `No` in every month, otherwise *Invalid / Missing*. Months that were never uploaded are not considered.
- **New VAN Users** = parties using VAN for the **first time**: a party is new in the first uploaded month (across all years) in which it has a valid VAN code. A party that stops and starts again (e.g. Apr `No`, May code, Jun `No`, Jul code) is new in May only. The earliest uploaded month is the baseline — parties already using VAN there are existing users, so it shows 0 new. A party first seen in a later file and already using VAN is new in that month. In **All Months** the count is the parties whose first use falls in that year (equal to the sum of the months). The *Parties → New VAN users only* filter (`newOnly=1`) restricts the whole dashboard, category breakdown and drill-down to these parties.
- The **pay term filter** only counts parties that are using VAN.
- `category_frequency_purchase` values (including `cash sales`) are categories, never pay terms.

## 7. Database schema

Defined in `backend/db/migrations/` (`001_initial_schema.sql`, `002_party_year_model.sql`, `003_uploads_per_file.sql`).

**`party_year_data`** — **one row per party per year**, unique on `(reporting_year, party_code)`:

- `reporting_year, party_code, party_name, sales_representative_name, group_head, regional_head, nos, category_frequency_purchase`
- `van_usage_jan … van_usage_dec` — one column per month (no year suffix, so the same schema serves every year); default `No`
- `pay_terms, van_nos, months_van_used, van_status, conversion_wave, van_no, upi, created_at, updated_at`

**`uploads`** — one row per uploaded file: `id, reporting_year, file_name, months (text[]), record_count, uploaded_at, created_at, updated_at`. The dashboard's month list is every month that appears in any upload for the year; the upload history marks months a later file replaced. (`003_uploads_per_file.sql` merged the older one-row-per-month history into one row per file.)

**`van_classification(usage, pay_terms)`** — SQL function holding the classification rules above; every dashboard query uses it.

Indexes: the unique `(reporting_year, party_code)` plus `(reporting_year, …)` on category, pay terms, regional head, group head and sales representative.

### Migrating from the earlier monthly model

`002_party_year_model.sql` converts existing `party_month_data` rows (one row per party per month) into `party_year_data`, copying each month's value into its `van_usage_<mon>` column (months a party was missing from become `No`; master fields come from its most recent month). Old data is not dropped: `party_month_data` is renamed to `party_month_data_legacy` as a backup (dropped automatically only if empty). Rows without a PARTY CODE are not copied and a NOTICE reports how many. The one destructive step: `uploads` keeps only the latest import per year/month.

## 8. API

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/uploads/preview` | multipart: `file`, `year`; validates without saving, returns the detected `months` (with `alreadyUploaded`), `totalRows`, `existingParties`, `newParties`, `ignoredColumns` |
| POST | `/api/uploads/excel` | multipart: `file`, `year`, `months` (JSON array, e.g. `["April","June"]`; omitted = all detected); returns `success, year, months, totalRows, newParties, updatedParties, resetToNo, ignoredColumns, message` |
| GET | `/api/uploads/history/:year` | one row per uploaded file with `months` and `replacedMonths` (omit `:year` for all years) |
| GET | `/api/dashboard/years` | distinct years in the database |
| GET | `/api/dashboard/months?year=2026` | months present for a year |
| GET | `/api/dashboard/pay-terms?year=&month=` | distinct pay terms |
| GET | `/api/dashboard/overview?year=&month=&payTerm=` | `totalParties, usingVAN, notUsingVAN, usingVANCredit, usingVANAdvance, usingVANOther, invalidMissing, vanUsagePercentage` |
| GET | `/api/dashboard/category-breakdown?year=&month=&payTerm=` | per-category metrics + totals |
| GET | `/api/dashboard/drilldown/regional-head` | |
| GET | `/api/dashboard/drilldown/group-head` | |
| GET | `/api/dashboard/drilldown/sales-representative` | |
| GET | `/api/dashboard/drilldown/parties` | party code, name, VAN value, pay terms, classification |

Overview and category breakdown also return `newVANUsers` and accept `newOnly=1`; the overview adds `newUsersBasis` (`startMonth`, `isStartMonth`).

Drilldown parameters: `year, month, payTerm, newOnly, category, metric, regionalHead, groupHead, salesRep`. `month=All Months` (or omitted) means the whole year. `metric` accepts camelCase or snake_case, e.g. `notUsingVAN` / `not_using_van`.

When there is no data, endpoints return `{ "noData": "year" }` or `{ "noData": "month" }` and the UI shows an empty state — never placeholder values.

`GET /healthz` returns `ok` without a login (used by the hosting platform).

## 9. Deploy for free (Render + Neon)

One free Render web service runs the API **and** serves the built frontend (one link); the data lives in a free Neon PostgreSQL database. Free plans change — check each provider's pricing page when you sign up.

What to expect on the free plans: the app sleeps after about 15 minutes without visitors, so the first visit after a break can take up to a minute. Nothing is lost on restarts or redeploys because all data is in the database.

**Shared login.** When `APP_USERNAME` and `APP_PASSWORD` are set, every page and API call needs that username/password (the browser shows its own login box). Leave them unset on your own PC to work without a login.

Steps:

1. **GitHub** — create a *private* repository and push this project to it (`backend/.env`, `node_modules/`, Excel files and `frontend/dist/` are git-ignored).
2. **Neon** (neon.tech) — create a project and copy its connection string (starts with `postgresql://`, ends with `sslmode=require`).
3. **Render** (render.com) — New → Web Service → choose the repository (Render reads `render.yaml`), plan **Free**. If you fill the form by hand: build command `npm run build:deploy`, start command `npm start`, health check path `/healthz`.
4. In Render → Environment, add:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | the Neon connection string |
   | `APP_USERNAME` | the shared username |
   | `APP_PASSWORD` | the shared password (use a long one) |

5. Deploy. `npm start` applies the database migrations automatically and then starts the server.
6. Open the Render link, log in, and upload your Excel files once — the online database starts empty.

Every later `git push` redeploys the app. To change the login, edit the two variables in Render and redeploy.

To try the deployed setup on your own PC: `npm run build:deploy`, then `npm start` and open http://localhost:3001 (the backend serves the built frontend).
