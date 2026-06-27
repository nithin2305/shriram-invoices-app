// Shriram Invoice App — tiny local backend.
// Node + Express, storing everything in a single SQLite file (invoices.db).
// No DB server to install: SQLite is Node's built-in `node:sqlite` module.
// Start with:  node server.js   (then the Angular app talks to http://localhost:3000)

const path = require('path');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'invoices.db');

// ---------------- DATABASE ----------------
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    invoiceNo    TEXT PRIMARY KEY,
    isoDate      TEXT,
    savedAt      TEXT,
    total        REAL,
    customerName TEXT,
    data         TEXT            -- full StoredInvoice as JSON
  );
  CREATE INDEX IF NOT EXISTS idx_invoices_isoDate ON invoices(isoDate);
  CREATE TABLE IF NOT EXISTS clients (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    data TEXT                    -- full client (CustomerDetails) as JSON
  );
`);

// ---------------- APP ----------------
const app = express();
app.use(express.json({ limit: '5mb' }));

// Allow the Angular dev server (different port) to call us.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { return res.sendStatus(204); }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------------- CLIENTS ----------------
app.get('/api/clients', (_req, res) => {
  const rows = db.prepare('SELECT data FROM clients ORDER BY name').all();
  res.json(rows.map(r => JSON.parse(r.data)));
});

app.post('/api/clients', (req, res) => {
  const c = req.body || {};
  db.prepare('INSERT INTO clients (name, data) VALUES (?, ?)')
    .run(c.name || '', JSON.stringify(c));
  res.status(201).json({ ok: true });
});

// Seed the client table once (only if it is currently empty).
app.post('/api/clients/seed', (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [];
  const count = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
  if (count === 0 && list.length) {
    const ins = db.prepare('INSERT INTO clients (name, data) VALUES (?, ?)');
    for (const c of list) { ins.run(c.name || '', JSON.stringify(c)); }
  }
  res.json({ seeded: count === 0 ? list.length : 0 });
});

// ---------------- INVOICES ----------------
// Save or update (upsert by invoiceNo) — this is what "Save entry" and "Modify" both call.
app.post('/api/invoices', (req, res) => {
  const inv = req.body || {};
  if (!inv.invoiceNo) { return res.status(400).json({ error: 'invoiceNo required' }); }
  db.prepare(`
    INSERT INTO invoices (invoiceNo, isoDate, savedAt, total, customerName, data)
    VALUES (@invoiceNo, @isoDate, @savedAt, @total, @customerName, @data)
    ON CONFLICT(invoiceNo) DO UPDATE SET
      isoDate=@isoDate, savedAt=@savedAt, total=@total,
      customerName=@customerName, data=@data
  `).run({
    invoiceNo: String(inv.invoiceNo),
    isoDate: inv.isoDate || '',
    savedAt: inv.savedAt || new Date().toISOString(),
    total: Number(inv.total) || 0,
    customerName: (inv.customer && inv.customer.name) || '',
    data: JSON.stringify(inv)
  });
  res.json({ ok: true, invoiceNo: inv.invoiceNo });
});

// Recent invoices (header info for the "modify" dropdown).
app.get('/api/invoices', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const rows = db.prepare('SELECT data FROM invoices ORDER BY savedAt DESC LIMIT ?').all(limit);
  res.json(rows.map(r => JSON.parse(r.data)));
});

// One invoice by number — used to populate the form when modifying.
app.get('/api/invoices/:invoiceNo', (req, res) => {
  const row = db.prepare('SELECT data FROM invoices WHERE invoiceNo = ?').get(req.params.invoiceNo);
  if (!row) { return res.status(404).json({ error: 'not found' }); }
  res.json(JSON.parse(row.data));
});

// All invoices for a given month (monthly report).
app.get('/api/invoices/month/:year/:month', (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  const rows = db.prepare(
    'SELECT data FROM invoices WHERE isoDate >= ? AND isoDate < ? ORDER BY isoDate'
  ).all(start, end);
  res.json(rows.map(r => JSON.parse(r.data)));
});

app.delete('/api/invoices/:invoiceNo', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE invoiceNo = ?').run(req.params.invoiceNo);
  res.json({ ok: true });
});

// ---------------- BACKUP / RESTORE ----------------
app.get('/api/export', (_req, res) => {
  const invoices = db.prepare('SELECT data FROM invoices').all().map(r => JSON.parse(r.data));
  const clients = db.prepare('SELECT data FROM clients').all().map(r => JSON.parse(r.data));
  res.json({ version: 1, exportedAt: new Date().toISOString(), invoices, clients });
});

app.post('/api/import', (req, res) => {
  const data = req.body || {};
  if (Array.isArray(data.invoices)) {
    const ins = db.prepare(`
      INSERT INTO invoices (invoiceNo, isoDate, savedAt, total, customerName, data)
      VALUES (@invoiceNo, @isoDate, @savedAt, @total, @customerName, @data)
      ON CONFLICT(invoiceNo) DO UPDATE SET
        isoDate=@isoDate, savedAt=@savedAt, total=@total,
        customerName=@customerName, data=@data
    `);
    for (const inv of data.invoices) {
      ins.run({
        invoiceNo: String(inv.invoiceNo),
        isoDate: inv.isoDate || '',
        savedAt: inv.savedAt || new Date().toISOString(),
        total: Number(inv.total) || 0,
        customerName: (inv.customer && inv.customer.name) || '',
        data: JSON.stringify(inv)
      });
    }
  }
  if (Array.isArray(data.clients)) {
    const ins = db.prepare('INSERT INTO clients (name, data) VALUES (?, ?)');
    for (const c of data.clients) {
      const { id, ...rest } = c;
      ins.run(rest.name || '', JSON.stringify(rest));
    }
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Shriram invoice backend running at http://localhost:${PORT}`);
  console.log(`SQLite file: ${DB_FILE}`);
});
