import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Invoice, CustomerDetails, invoiceTotal } from './invoice.model';

/** A stored invoice (header fields + the variable-length parts). */
export interface StoredInvoice {
  invoiceNo: string;        // primary key
  isoDate: string;          // yyyy-mm-dd, for month queries
  dateDisplay: string;      // dd.mm.yyyy
  customer: CustomerDetails;
  vehicles: { vehicleNo: string; vehicleType: string }[];
  charges: { label: string; amount: number }[];
  lrRows: { lrNo: string; date: string; from: string; to: string; description: string; pkgs: string }[];
  gstNote: string;
  amountInWords: string;
  total: number;
  digitalSignature: boolean;
  signatoryName: string;
  bothCopies: boolean;
  savedAt: string;          // ISO timestamp
}

export interface StoredClient extends CustomerDetails {
  id?: number;
}

class InvoiceDB extends Dexie {
  invoices!: Table<StoredInvoice, string>;
  clients!: Table<StoredClient, number>;

  constructor() {
    super('shriram_invoices');
    this.version(1).stores({
      invoices: 'invoiceNo, isoDate, savedAt',
      clients: '++id, name'
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private db = new InvoiceDB();

  // ---------------- CLIENTS ----------------
  async listClients(): Promise<CustomerDetails[]> {
    const rows = await this.db.clients.orderBy('name').toArray();
    return rows.map(({ id, ...c }) => c);
  }

  async addClient(c: CustomerDetails): Promise<void> {
    await this.db.clients.add({ ...c });
  }

  /** Seed the client table once (from the bundled list) if it's empty. */
  async seedClientsIfEmpty(list: CustomerDetails[]): Promise<void> {
    const count = await this.db.clients.count();
    if (count === 0 && list.length) {
      await this.db.clients.bulkAdd(list.map(c => ({ ...c })));
    }
  }

  // ---------------- INVOICES ----------------
  async saveInvoice(inv: Invoice): Promise<void> {
    const rec: StoredInvoice = {
      invoiceNo: inv.invoiceNo,
      isoDate: this.toIso(inv.date),
      dateDisplay: inv.date,
      customer: { ...inv.customer },
      vehicles: inv.vehicles,
      charges: inv.charges,
      lrRows: inv.lrRows,
      gstNote: inv.gstNote,
      amountInWords: inv.amountInWords,
      total: invoiceTotal(inv),
      digitalSignature: inv.digitalSignature,
      signatoryName: inv.signatoryName,
      bothCopies: inv.bothCopies,
      savedAt: new Date().toISOString()
    };
    await this.db.invoices.put(rec);   // put = insert or overwrite by invoiceNo
  }

  async listByMonth(year: number, month: number): Promise<StoredInvoice[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    return this.db.invoices
      .where('isoDate').between(start, end, true, false)
      .sortBy('isoDate');
  }

  async listRecent(limit = 50): Promise<StoredInvoice[]> {
    const all = await this.db.invoices.orderBy('savedAt').reverse().toArray();
    return all.slice(0, limit);
  }

  async deleteInvoice(invoiceNo: string): Promise<void> {
    await this.db.invoices.delete(invoiceNo);
  }

  rowToInvoice(rec: StoredInvoice, company: Invoice['company']): Invoice {
    return {
      company,
      customer: { ...rec.customer },
      invoiceNo: rec.invoiceNo,
      date: rec.dateDisplay,
      vehicles: rec.vehicles ?? [],
      charges: rec.charges ?? [],
      lrRows: rec.lrRows ?? [],
      gstNote: rec.gstNote,
      amountInWords: rec.amountInWords,
      digitalSignature: rec.digitalSignature,
      signatoryName: rec.signatoryName,
      bothCopies: rec.bothCopies
    };
  }

  // ---------------- BACKUP / RESTORE ----------------
  async exportAll(): Promise<string> {
    const invoices = await this.db.invoices.toArray();
    const clients = await this.db.clients.toArray();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), invoices, clients }, null, 2);
  }

  async importAll(json: string): Promise<void> {
    const data = JSON.parse(json);
    if (data.invoices) { await this.db.invoices.bulkPut(data.invoices); }
    if (data.clients) {
      await this.db.clients.bulkAdd((data.clients as StoredClient[]).map(({ id, ...c }) => c));
    }
  }

  private toIso(ddmmyyyy: string): string {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((ddmmyyyy || '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
  }
}