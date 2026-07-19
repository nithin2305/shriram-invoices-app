# Shriram Logistics — Invoice Generator (Angular)

Generates invoices in the exact SHRIRAM LOGISTICS printed format as **PDF** (2 pages:
DUPLICATE COPY + ORIGINAL COPY, identical to the original) and **Excel** (.xlsx,
same structure on two sheets).

## Data storage — Supabase (cloud)

All invoices and clients are stored in a free **Supabase** (cloud Postgres)
database. The app works the same whether you run it locally or deploy it to
**GitHub Pages**, and your data syncs across every device.

### One-time setup

1. Create a free project at <https://supabase.com>.
2. **SQL Editor → New query** → paste the contents of
   [`supabase-schema.sql`](supabase-schema.sql) → **Run**. This creates the
   `invoices` and `clients` tables and their access policies.
3. **Project Settings → API**, copy:
   - *Project URL* and *anon public* key.
4. Paste both into [`src/app/supabase.config.ts`](src/app/supabase.config.ts).

That's it — no server to run.

> 🔒 **Security:** the anon key is meant to be public (it's safe to commit).
> The data itself is protected by **Supabase Auth**: the policies in
> `supabase-schema.sql` only allow logged-in users, and the app shows a login
> screen. Create your login user under **Authentication → Users → Add user**
> and turn **"Allow new users to sign up" OFF** under Authentication → Sign In /
> Providers. (Existing projects that ran the old schema: run
> [`supabase-auth-migration.sql`](supabase-auth-migration.sql) once.)

## Run locally

```bash
npm install        # first time only
npm start          # opens at http://localhost:4200
```

## Deploy to GitHub Pages

1. Make sure `src/app/supabase.config.ts` is filled in (it gets baked into the build).
2. In `package.json`, set the `deploy` script's `--base-href` to **`/<your-repo-name>/`**
   (currently `/shriram-invoices-app/`).
3. Push this project to a GitHub repo, then:

   ```bash
   npm run deploy   # builds, publishes, then VERIFIES the live site updated
   ```

   The deploy script ([`deploy.mjs`](deploy.mjs)) polls the live URL after
   pushing and automatically pushes again if GitHub Pages skipped the build
   (a known intermittent quirk), so one command always gets the site updated.

4. In the repo: **Settings → Pages → Source = `gh-pages` branch**. Your app goes
   live at `https://<user>.github.io/<repo-name>/`.

Because saving goes to Supabase (not a local server), **"Save entry" works on the
live GitHub Pages site** and the data persists in the cloud. Note: the deployed
site does *not* write back to your git repo — your data lives in Supabase, while
git only holds the app's source code.

### Modify an existing invoice

In **"Modify saved invoice"**, pick an invoice number — it populates the whole
form. Change anything and press **Update entry**; it overwrites that invoice in
the database (upsert by invoice no). New invoice numbers are inserted as usual.

> A legacy local-only Node + Express + SQLite backend is still in `server/`
> if you ever want fully offline storage, but the app now uses Supabase by default.

## Features

- Form input for: invoice no, date, vehicle no/type, customer (bill-to) details,
  multiple L.R. rows (add/remove), transportation + unloading charges, GST note.
- **Auto invoice number**: on load the form is pre-filled with the next free
  number (highest saved + 1); typing an existing number shows an overwrite
  warning and saving asks for confirmation.
- **Saved invoices list** with filter, per-row **Load** (edit in place) and
  **Copy** (duplicate with next number + today's date), plus checkboxes to
  **bulk-download the selected invoices as PDFs in one ZIP**.
- **Manage clients**: add, edit and delete clients from the UI (and a one-click
  "save this bill-to as a client" button).
- **Validation before save**: invoice no, valid dd.mm.yyyy dates, customer name,
  15-char GST No, non-zero total, labelled charges — errors listed at the top.
- **Financial-year report** (April–March): Excel with month-wise totals,
  client-wise totals, and the full invoice list.
- **Client-wise statement**: pick a client and a from/to date range (blank =
  all time) and download every matching invoice as **Excel** or a tabular
  **PDF statement** with totals and page numbers.
- Total auto-calculated; **Amount in words auto-generated** in Indian format
  ("RUPEES EIGHT THOUSAND SIX HUNDRED TWENTY ONLY"), still editable.
- Live PDF preview pane (debounced, updates as you type).
- Company details (name, GSTIN, PAN, bank details, jurisdiction) pre-filled and
  editable under "Company details".
- PDF: jsPDF, drawn to mm-precise coordinates replicating the original layout.
- Excel: ExcelJS with merged cells, borders, Times New Roman fonts, print-fit page setup.

## Key files

| File | Purpose |
|---|---|
| `supabase-schema.sql` | SQL to create the cloud tables + access policies (run once) |
| `src/app/supabase.config.ts` | Your Supabase URL + anon key (fill these in) |
| `src/app/data.service.ts`  | Supabase client (save/load/modify/report/backup) |
| `src/app/app.component.ts` | Form UI + live preview + "Modify saved invoice" |
| `server/server.js` | *Legacy* local Node + Express + SQLite backend (optional) |
| `src/app/pdf.service.ts`   | Exact-layout PDF generation (jsPDF) |
| `src/app/excel.service.ts` | Excel generation (ExcelJS) |
| `src/app/number-to-words.ts` | Indian-system amount-in-words |
| `src/app/invoice.model.ts` | Data model + defaults |
