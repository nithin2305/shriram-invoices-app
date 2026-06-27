import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Invoice, CustomerDetails, invoiceTotal } from './invoice.model';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.config';

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

/** One row of the `invoices` table. The full invoice lives in `data` (jsonb). */
interface InvoiceRow {
  invoice_no: string;
  iso_date: string;
  saved_at: string;
  total: number;
  customer_name: string;
  data: StoredInvoice;
}

/**
 * Stores all data in a Supabase (cloud Postgres) database.
 * Works both locally (npm start) and when deployed to GitHub Pages, and syncs
 * across every device. Configure your project in `supabase.config.ts`.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------------- CLIENTS ----------------
  async listClients(): Promise<CustomerDetails[]> {
    const { data, error } = await this.sb.from('clients').select('data').order('name');
    if (error) { throw error; }
    return (data ?? []).map(r => r.data as CustomerDetails);
  }

  async addClient(c: CustomerDetails): Promise<void> {
    const { error } = await this.sb.from('clients').insert({ name: c.name, data: c });
    if (error) { throw error; }
  }

  /** Seed the client table once (only if it is currently empty). */
  async seedClientsIfEmpty(list: CustomerDetails[]): Promise<void> {
    const { count, error } = await this.sb
      .from('clients')
      .select('id', { count: 'exact', head: true });
    if (error) { throw error; }
    if ((count ?? 0) === 0 && list.length) {
      const rows = list.map(c => ({ name: c.name, data: c }));
      const { error: insErr } = await this.sb.from('clients').insert(rows);
      if (insErr) { throw insErr; }
    }
  }

  // ---------------- INVOICES ----------------
  /** Save or update. Upserts by invoice_no, so this also "modifies". */
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
    const row: InvoiceRow = {
      invoice_no: rec.invoiceNo,
      iso_date: rec.isoDate,
      saved_at: rec.savedAt,
      total: rec.total,
      customer_name: rec.customer.name,
      data: rec
    };
    const { error } = await this.sb.from('invoices').upsert(row, { onConflict: 'invoice_no' });
    if (error) { throw error; }
  }

  /** Fetch a single saved invoice by its number (used to populate the form when modifying). */
  async getInvoice(invoiceNo: string): Promise<StoredInvoice | null> {
    const { data, error } = await this.sb
      .from('invoices').select('data').eq('invoice_no', invoiceNo).maybeSingle();
    if (error) { throw error; }
    return data ? (data.data as StoredInvoice) : null;
  }

  async listByMonth(year: number, month: number): Promise<StoredInvoice[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    const { data, error } = await this.sb
      .from('invoices').select('data')
      .gte('iso_date', start).lt('iso_date', end)
      .order('iso_date');
    if (error) { throw error; }
    return (data ?? []).map(r => r.data as StoredInvoice);
  }

  async listRecent(limit = 50): Promise<StoredInvoice[]> {
    const { data, error } = await this.sb
      .from('invoices').select('data')
      .order('saved_at', { ascending: false }).limit(limit);
    if (error) { throw error; }
    return (data ?? []).map(r => r.data as StoredInvoice);
  }

  async deleteInvoice(invoiceNo: string): Promise<void> {
    const { error } = await this.sb.from('invoices').delete().eq('invoice_no', invoiceNo);
    if (error) { throw error; }
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
    const [inv, cli] = await Promise.all([
      this.sb.from('invoices').select('data'),
      this.sb.from('clients').select('data')
    ]);
    if (inv.error) { throw inv.error; }
    if (cli.error) { throw cli.error; }
    const invoices = (inv.data ?? []).map(r => r.data);
    const clients = (cli.data ?? []).map(r => r.data);
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), invoices, clients },
      null, 2
    );
  }

  async importAll(json: string): Promise<void> {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed.invoices) && parsed.invoices.length) {
      const rows: InvoiceRow[] = parsed.invoices.map((rec: StoredInvoice) => ({
        invoice_no: rec.invoiceNo,
        iso_date: rec.isoDate ?? this.toIso(rec.dateDisplay),
        saved_at: rec.savedAt ?? new Date().toISOString(),
        total: Number(rec.total) || 0,
        customer_name: rec.customer?.name ?? '',
        data: rec
      }));
      const { error } = await this.sb.from('invoices').upsert(rows, { onConflict: 'invoice_no' });
      if (error) { throw error; }
    }
    if (Array.isArray(parsed.clients) && parsed.clients.length) {
      const rows = parsed.clients.map((c: StoredClient) => {
        const { id, ...rest } = c;
        return { name: rest.name, data: rest };
      });
      const { error } = await this.sb.from('clients').insert(rows);
      if (error) { throw error; }
    }
  }

  private toIso(ddmmyyyy: string): string {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((ddmmyyyy || '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
  }
}
