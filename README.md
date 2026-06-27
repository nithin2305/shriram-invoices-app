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

> ⚠️ **Security:** the anon key is meant to be public (it's safe to commit), but
> the default policies in `supabase-schema.sql` let anyone with your site URL
> read/write the data. Fine for an internal tool; if you need it private, add
> Supabase Auth and switch the policies from `anon` to `authenticated`.

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
   npm run deploy   # builds for production and pushes to the gh-pages branch
   ```

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
