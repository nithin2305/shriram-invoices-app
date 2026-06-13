# Shriram Logistics — Invoice Generator (Angular)

Generates invoices in the exact SHRIRAM LOGISTICS printed format as **PDF** (2 pages:
DUPLICATE COPY + ORIGINAL COPY, identical to the original) and **Excel** (.xlsx,
same structure on two sheets).

## Run

```bash
npm install
npm start          # opens at http://localhost:4200
```

## Build for production

```bash
npm run build      # output in dist/shriram-invoice-app
```

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
| `src/app/app.component.ts` | Form UI + live preview |
| `src/app/pdf.service.ts`   | Exact-layout PDF generation (jsPDF) |
| `src/app/excel.service.ts` | Excel generation (ExcelJS) |
| `src/app/number-to-words.ts` | Indian-system amount-in-words |
| `src/app/invoice.model.ts` | Data model + defaults |
