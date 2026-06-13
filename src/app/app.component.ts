import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  Invoice, DEFAULT_COMPANY, DEFAULT_GST_NOTE, invoiceTotal, formatAmount
} from './invoice.model';
import { numberToWordsIndian } from './number-to-words';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { CLIENTS } from './clients';
import { DataService, StoredInvoice } from './data.service';
import { MonthlyReportService } from './monthly-report.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="page">
    <header class="topbar">
      <h1>{{ inv.company.name }} — Invoice Generator</h1>
      <div class="actions">
        <button class="btn ghost" (click)="refreshPreview()">Refresh preview</button>
        <button class="btn save" (click)="saveToDb()">{{ saving ? 'Saving…' : 'Save entry' }}</button>
        <button class="btn" (click)="downloadPdf()">Download PDF</button>
        <button class="btn" (click)="downloadExcel()">Download Excel</button>
      </div>
    </header>

    <div class="layout">
      <!-- ==================== FORM ==================== -->
      <div class="form-pane">
<section class="card">
          <h2>Saved entries &amp; monthly report</h2>
          <div class="grid g3">
            <label>Year <input type="number" [(ngModel)]="reportYear"></label>
            <label>Month
              <select [(ngModel)]="reportMonth">
                <option *ngFor="let m of months; let i = index" [value]="i+1">{{ m }}</option>
              </select>
            </label>
            <label>&nbsp;
              <button class="btn" (click)="downloadMonthlyReport()">{{ reporting ? 'Working…' : 'Monthly Excel' }}</button>
            </label>
          </div>
          <div class="grid g2" style="margin-top:10px">
            <button class="btn ghost dark" (click)="backup()">Backup all (JSON)</button>
            <label class="restorebtn">Restore from backup
              <input type="file" accept="application/json" (change)="restore($event)">
            </label>
          </div>
          <p class="status" *ngIf="dbStatus">{{ dbStatus }}</p>
        </section>
        <section class="card">
          <h2>Copies</h2>
          <label class="checkbox-row">
            <input type="checkbox" [(ngModel)]="inv.bothCopies" (ngModelChange)="onChange()">
            <span>Print both ORIGINAL & DUPLICATE (uncheck for ORIGINAL only)</span>
          </label>
        </section>

        <section class="card">
          <h2>Invoice details</h2>
          <div class="grid g2">
            <label>Invoice No <input [(ngModel)]="inv.invoiceNo" (ngModelChange)="onChange()"></label>
            <label>Date (dd.mm.yyyy) <input [(ngModel)]="inv.date" (ngModelChange)="onChange()"></label>
          </div>
        </section>

        <section class="card">
          <h2>Vehicles</h2>
          <div class="row-line" *ngFor="let v of inv.vehicles; let i = index">
            <label>Vehicle No <input [(ngModel)]="v.vehicleNo" (ngModelChange)="onChange()"></label>
            <label>Vehicle Type
              <select [(ngModel)]="v.vehicleType" (ngModelChange)="onChange()">
                <option>FTL</option><option>LTL</option><option>PTL</option><option>ODC</option>
              </select>
            </label>
            <button class="btn small danger" (click)="removeVehicle(i)" [disabled]="inv.vehicles.length === 1">×</button>
          </div>
          <button class="btn add small" (click)="addVehicle()">+ Add vehicle</button>
        </section>

        <section class="card">
          <h2>Bill to (customer)</h2>
          <label class="full">Select client
            <select [(ngModel)]="selectedClient" (ngModelChange)="onClientSelect($event)">
              <option value="">— Manual entry —</option>
              <option *ngFor="let cl of clients" [value]="cl.name">{{ cl.name }}</option>
            </select>
          </label>
          <div class="grid g2" style="margin-top:10px">
            <label>Name <input [(ngModel)]="inv.customer.name" (ngModelChange)="onCustomerEdit()"></label>
            <label>GST No <input [ngModel]="inv.customer.gstNo || ''" (ngModelChange)="inv.customer.gstNo = $event; onCustomerEdit()"></label>
            <label>Address line 1 <input [(ngModel)]="inv.customer.addressLine1" (ngModelChange)="onCustomerEdit()"></label>
            <label>Address line 2 <input [(ngModel)]="inv.customer.addressLine2" (ngModelChange)="onCustomerEdit()"></label>
          </div>
        </section>

        <section class="card">
          <h2>L.R. details</h2>
          <table class="lr-table">
            <thead>
              <tr><th>L.R. No</th><th>Date</th><th>From</th><th>To</th><th>Description</th><th>Pkgs</th><th></th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of inv.lrRows; let i = index">
                <td data-label="L.R. No"><input [(ngModel)]="row.lrNo" (ngModelChange)="onChange()"></td>
                <td data-label="Date"><input [(ngModel)]="row.date" (ngModelChange)="onChange()"></td>
                <td data-label="From"><input [(ngModel)]="row.from" (ngModelChange)="onChange()"></td>
                <td data-label="To"><input [(ngModel)]="row.to" (ngModelChange)="onChange()"></td>
                <td data-label="Description"><input [(ngModel)]="row.description" (ngModelChange)="onChange()"></td>
                <td data-label="Pkgs"><input [(ngModel)]="row.pkgs" (ngModelChange)="onChange()" placeholder="ROLL 12"></td>
                <td class="lr-remove"><button class="btn small danger" (click)="removeLr(i)" [disabled]="inv.lrRows.length === 1">×</button></td>
              </tr>
            </tbody>
          </table>
          <button class="btn add small" (click)="addLr()">+ Add L.R. row</button>
        </section>

        <section class="card">
          <h2>Charges</h2>
          <div class="row-line" *ngFor="let ch of inv.charges; let i = index">
            <label>{{ i === 0 ? 'Main charge label' : 'Charge label' }}
              <input [(ngModel)]="ch.label" (ngModelChange)="onChange()">
            </label>
            <label>Amount
              <input type="number" [(ngModel)]="ch.amount" (ngModelChange)="onChange()">
            </label>
            <button class="btn small danger" (click)="removeCharge(i)" [disabled]="inv.charges.length === 1">×</button>
          </div>
          <button class="btn add small" (click)="addCharge()">+ Add charge</button>
          <div class="grid g1" style="margin-top:10px">
            <label>Total <input [value]="totalDisplay" readonly class="readonly"></label>
          </div>
          <label class="full">GST note
            <input [(ngModel)]="inv.gstNote" (ngModelChange)="onChange()">
          </label>
          <label class="full">Amount in words (auto)
            <input [(ngModel)]="inv.amountInWords">
          </label>
        </section>

        <section class="card">
          <h2>Signature</h2>
          <label class="checkbox-row">
            <input type="checkbox" [(ngModel)]="inv.digitalSignature" (ngModelChange)="onChange()">
            <span>Add digital signature</span>
          </label>
          <label class="full" *ngIf="inv.digitalSignature">Signatory name
            <input [(ngModel)]="inv.signatoryName" (ngModelChange)="onChange()">
          </label>
        </section>

        <details class="card">
          <summary><h2 class="inline">Company details (edit if needed)</h2></summary>
          <div class="grid g2">
            <label>Name <input [(ngModel)]="inv.company.name" (ngModelChange)="onChange()"></label>
            <label>Address <input [(ngModel)]="inv.company.address" (ngModelChange)="onChange()"></label>
            <label>Contact <input [(ngModel)]="inv.company.contact" (ngModelChange)="onChange()"></label>
            <label>E-mail <input [(ngModel)]="inv.company.email" (ngModelChange)="onChange()"></label>
            <label>State <input [(ngModel)]="inv.company.state" (ngModelChange)="onChange()"></label>
            <label>GSTIN <input [(ngModel)]="inv.company.gstin" (ngModelChange)="onChange()"></label>
            <label>PAN <input [(ngModel)]="inv.company.pan" (ngModelChange)="onChange()"></label>
            <label>Jurisdiction <input [(ngModel)]="inv.company.jurisdiction" (ngModelChange)="onChange()"></label>
            <label>Bank name <input [(ngModel)]="inv.company.bankName" (ngModelChange)="onChange()"></label>
            <label>A/C No <input [(ngModel)]="inv.company.accountNo" (ngModelChange)="onChange()"></label>
            <label>Branch <input [(ngModel)]="inv.company.branch" (ngModelChange)="onChange()"></label>
            <label>IFSC <input [(ngModel)]="inv.company.ifsc" (ngModelChange)="onChange()"></label>
          </div>
        </details>
      </div>

      <!-- ==================== PREVIEW ==================== -->
      <div class="preview-pane">
        <iframe *ngIf="previewSrc" [src]="previewSrc" title="Invoice preview"></iframe>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { display: block; font-family: 'Segoe UI', system-ui, sans-serif; }
    * { box-sizing: border-box; }
    .page { min-height: 100vh; background: #eef1f4; }

    .topbar { display: flex; justify-content: space-between; align-items: center;
      padding: 12px 20px; background: #1a2b49; color: #fff; position: sticky; top: 0; z-index: 5;
      flex-wrap: wrap; gap: 10px; }
    .topbar h1 { font-size: 17px; margin: 0; font-weight: 600; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }

    .btn { background: #d9a40b; color: #1a2b49; border: none; padding: 8px 16px;
      border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 13px; }
    .btn:hover { filter: brightness(1.08); }
    .btn.ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
    .btn.small { padding: 4px 10px; font-size: 12px; }
    .btn.add { background: #fff; color: #1a2b49; border: 1.5px dashed #1a2b49;
      margin-top: 4px; }
    .btn.add:hover { background: #1a2b49; color: #fff; }
    .btn.danger { background: #c0392b; color: #fff; }
    .btn:disabled { opacity: .4; cursor: not-allowed; }

    .layout { display: grid; grid-template-columns: minmax(420px, 1fr) minmax(420px, 1fr);
      gap: 16px; padding: 16px 20px; }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } }

    .card { background: #fff; border-radius: 6px; padding: 14px 16px; margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
      color: #1a2b49; margin: 0 0 10px; }
    .card h2.inline { display: inline; }
    details.card summary { cursor: pointer; }

    .grid { display: grid; gap: 10px; }
    .g2 { grid-template-columns: 1fr 1fr; }
    .g3 { grid-template-columns: 1fr 1fr 1fr; }
    .g4 { grid-template-columns: repeat(4, 1fr); }
    @media (max-width: 700px) { .g2, .g3, .g4 { grid-template-columns: 1fr; } }

    label { display: flex; flex-direction: column; font-size: 12px; color: #45556b; gap: 3px; }
    label.full { margin-top: 10px; }
    input, select { padding: 9px 10px; border: 1px solid #c8d0da; border-radius: 4px;
      font-size: 16px; font-family: inherit; width: 100%; }
    input:focus, select:focus { outline: 2px solid #1a2b49; outline-offset: -1px; }
    input.readonly { background: #f1f4f7; font-weight: 700; }

    .row-line { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px;
      align-items: end; margin-bottom: 8px; }
    .g1 { grid-template-columns: 1fr; }
    .checkbox-row { flex-direction: row; align-items: center; gap: 8px; font-size: 14px;
      color: #1a2b49; cursor: pointer; }
    .checkbox-row input { width: 18px; height: 18px; cursor: pointer; flex: none; }

    /* L.R. table: real table on desktop, stacked cards on mobile */
    .lr-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .lr-table th { font-size: 11px; text-align: left; color: #45556b; padding: 2px 4px; }
    .lr-table td { padding: 2px 4px; }
    .lr-table input { width: 100%; box-sizing: border-box; }

    .lr-card { display: none; }

    .preview-pane { position: sticky; top: 64px; height: calc(100vh - 80px); }
    .preview-pane iframe { width: 100%; height: 100%; border: 1px solid #c8d0da;
      border-radius: 6px; background: #fff; }

    /* ---------------- MOBILE ---------------- */
    @media (max-width: 700px) {
      .topbar { padding: 10px 14px; }
      .topbar h1 { font-size: 15px; width: 100%; }
      .actions { width: 100%; }
      .actions .btn { flex: 1; text-align: center; }

      .layout { padding: 10px; gap: 10px; }
      .card { padding: 12px; }

      .row-line { grid-template-columns: 1fr; gap: 6px; position: relative;
        border: 1px solid #e3e8ef; border-radius: 6px; padding: 10px; padding-top: 12px; }
      .row-line .btn.danger { position: absolute; top: 6px; right: 6px;
        width: 30px; height: 30px; padding: 0; line-height: 1; }

      /* stacked LR entries become cards */
      .lr-table thead { display: none; }
      .lr-table, .lr-table tbody, .lr-table tr, .lr-table td { display: block; width: 100%; }
      .lr-table tr { border: 1px solid #e3e8ef; border-radius: 6px; padding: 10px;
        margin-bottom: 10px; position: relative; }
      .lr-table td { padding: 4px 0; }
      .lr-table td::before { content: attr(data-label); display: block; font-size: 11px;
        color: #45556b; margin-bottom: 2px; }
      .lr-table td.lr-remove { padding: 0; }
      .lr-table td.lr-remove::before { display: none; }
      .lr-table td.lr-remove .btn.danger { position: absolute; top: 8px; right: 8px;
        width: 30px; height: 30px; padding: 0; }

      /* preview goes below the form, fixed comfortable height, not sticky */
      .preview-pane { position: static; height: 70vh; margin-top: 4px; }
    }
  `]
})
export class AppComponent {
  inv: Invoice = {
    company: { ...DEFAULT_COMPANY },
    customer: { ...CLIENTS[0] },
    invoiceNo: '3045',
    date: this.today(),
    vehicles: [
      { vehicleNo: 'TN 19 BU 3984', vehicleType: 'FTL' }
    ],
    charges: [
      { label: 'Transportation Charges', amount: 8500 },
      { label: 'UNLOADING CHARGES', amount: 120 }
    ],
    lrRows: [
      { lrNo: '3193', date: '02.06.2026', from: 'CHENNAI', to: 'NELAMANGALA', description: 'FABRICS', pkgs: 'ROLL\n12' }
    ],
    gstNote: DEFAULT_GST_NOTE,
    amountInWords: '',
    digitalSignature: true,
    signatoryName: 'A.N.MISHRA',
    bothCopies: true
  };

  previewSrc: SafeResourceUrl | null = null;
  clients = CLIENTS;
  selectedClient = '';
  saving = false;
  reporting = false;
  dbStatus = '';
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth() + 1;
  months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

constructor(
    private pdf: PdfService,
    private excel: ExcelService,
    private sanitizer: DomSanitizer,
    private data: DataService,
    private report: MonthlyReportService
  ) {
    this.updateWords();
    this.selectedClient = CLIENTS[0].name;
    this.refreshPreview();
    this.loadClientsFromDb();
  }

  async loadClientsFromDb(): Promise<void> {
    try {
      await this.data.seedClientsIfEmpty(CLIENTS);
      const list = await this.data.listClients();
      if (list.length) { this.clients = list; }
    } catch {
      // keep the bundled CLIENTS list
    }
  }

  async saveToDb(): Promise<void> {
    this.saving = true; this.dbStatus = '';
    try {
      await this.data.saveInvoice(this.inv);
      this.dbStatus = `Saved invoice ${this.inv.invoiceNo}.`;
    } catch (e: any) {
      this.dbStatus = 'Save failed: ' + (e?.message ?? 'unknown error.');
    } finally {
      this.saving = false;
    }
  }

  async downloadMonthlyReport(): Promise<void> {
    this.reporting = true; this.dbStatus = '';
    try {
      const rows: StoredInvoice[] = await this.data.listByMonth(this.reportYear, this.reportMonth);
      if (!rows.length) { this.dbStatus = 'No invoices found for that month.'; return; }
      await this.report.generate(rows, this.reportYear, this.reportMonth);
      this.dbStatus = `Generated report for ${rows.length} invoice(s).`;
    } catch (e: any) {
      this.dbStatus = 'Report failed: ' + (e?.message ?? 'unknown error.');
    } finally {
      this.reporting = false;
    }
  }

  async backup(): Promise<void> {
    const json = await this.data.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `invoices_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.dbStatus = 'Backup downloaded.';
  }

  async restore(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) { return; }
    try {
      const text = await file.text();
      await this.data.importAll(text);
      await this.loadClientsFromDb();
      this.dbStatus = 'Backup restored.';
    } catch (e: any) {
      this.dbStatus = 'Restore failed: ' + (e?.message ?? 'invalid file.');
    } finally {
      input.value = '';
    }
  }

  get totalDisplay(): string {
    return formatAmount(invoiceTotal(this.inv));
  }

  /** When a client is picked from the dropdown, fill the customer fields. */
  onClientSelect(name: string): void {
    const cl = this.clients.find(c => c.name === name);
    if (cl) {
      this.inv.customer = { ...cl };
    }
    this.onChange();
  }

  /** Manual edits to the customer fields switch the dropdown back to manual entry. */
  onCustomerEdit(): void {
    const match = this.clients.find(c =>
      c.name === this.inv.customer.name &&
      c.gstNo === this.inv.customer.gstNo &&
      c.addressLine1 === this.inv.customer.addressLine1 &&
      c.addressLine2 === this.inv.customer.addressLine2);
    this.selectedClient = match ? match.name : '';
    this.onChange();
  }

  onChange(): void {
    this.updateWords();
    // debounce preview regeneration
    if (this.previewTimer) { clearTimeout(this.previewTimer); }
    this.previewTimer = setTimeout(() => this.refreshPreview(), 600);
  }

  updateWords(): void {
    this.inv.amountInWords = numberToWordsIndian(invoiceTotal(this.inv));
  }

  refreshPreview(): void {
    const url = this.pdf.previewUrl(this.inv);
    this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  addLr(): void {
    this.inv.lrRows.push({ lrNo: '', date: '', from: '', to: '', description: '', pkgs: '' });
    this.onChange();
  }

  removeLr(i: number): void {
    this.inv.lrRows.splice(i, 1);
    this.onChange();
  }

  addVehicle(): void {
    this.inv.vehicles.push({ vehicleNo: '', vehicleType: 'FTL' });
    this.onChange();
  }

  removeVehicle(i: number): void {
    this.inv.vehicles.splice(i, 1);
    this.onChange();
  }

  addCharge(): void {
    this.inv.charges.push({ label: '', amount: 0 });
    this.onChange();
  }

  removeCharge(i: number): void {
    this.inv.charges.splice(i, 1);
    this.onChange();
  }

  downloadPdf(): void {
    this.pdf.generate(this.inv);
  }

  async downloadExcel(): Promise<void> {
    await this.excel.generate(this.inv);
  }

  private today(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
}