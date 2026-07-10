import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Invoice, DEFAULT_COMPANY, DEFAULT_GST_NOTE, invoiceTotal, formatAmount
} from './invoice.model';
import { numberToWordsIndian } from './number-to-words';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { CLIENTS } from './clients';
import { DataService, StoredInvoice, StoredClient } from './data.service';
import { MonthlyReportService } from './monthly-report.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <!-- ==================== LOGIN GATE ==================== -->
  <div class="page login-page" *ngIf="authed !== true">
    <form class="card login-card" (ngSubmit)="login()" *ngIf="authed === false">
      <h1>{{ inv.company.name }}</h1>
      <p class="login-sub">Invoice Generator — sign in to continue</p>
      <label>E-mail
        <input type="email" name="email" [(ngModel)]="loginEmail" autocomplete="username" required>
      </label>
      <label>Password
        <input type="password" name="password" [(ngModel)]="loginPassword" autocomplete="current-password" required>
      </label>
      <p class="login-error" *ngIf="loginError">{{ loginError }}</p>
      <button class="btn save" type="submit" [disabled]="loginBusy || !loginEmail || !loginPassword">
        {{ loginBusy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
    <p class="login-sub" *ngIf="authed === null">Checking session…</p>
  </div>

  <div class="page" *ngIf="authed === true">
    <header class="topbar">
      <h1>{{ inv.company.name }} — Invoice Generator</h1>
      <div class="actions">
        <button class="btn ghost" (click)="refreshPreview()">Refresh preview</button>
        <button class="btn" (click)="downloadPdf()">Download PDF</button>
        <button class="btn" (click)="downloadExcel()">Download Excel</button>
        <button class="btn save" (click)="saveToDb()">{{ saving ? 'Saving…' : (isExisting ? 'Update entry' : 'Save entry') }}</button>
        <button class="btn ghost" (click)="logout()" title="Sign out">Log out</button>
      </div>
    </header>

    <div class="errorbar" *ngIf="validationErrors.length">
      <strong>Cannot save yet — fix these first:</strong>
      <ul><li *ngFor="let e of validationErrors">{{ e }}</li></ul>
    </div>

    <div class="layout">
      <!-- ==================== FORM ==================== -->
      <div class="form-pane">

        <section class="card">
          <h2>Reports &amp; backup</h2>
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
          <div class="grid g3" style="margin-top:10px">
            <label style="grid-column: span 2">Financial year (Apr–Mar)
              <select [(ngModel)]="fyStart">
                <option *ngFor="let y of fyYears" [ngValue]="y">Apr {{ y }} – Mar {{ y + 1 }}</option>
              </select>
            </label>
            <label>&nbsp;
              <button class="btn" (click)="downloadFyReport()">{{ fyReporting ? 'Working…' : 'FY Excel' }}</button>
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
          <h2>Saved invoices</h2>
          <label class="full" style="margin-top:0">Filter
            <input [(ngModel)]="invoiceFilter" placeholder="Search by invoice no / customer / date">
          </label>
          <div class="inv-toolbar">
            <label class="checkbox-row">
              <input type="checkbox" [checked]="allFilteredSelected" (change)="toggleAllFiltered()">
              <span>Select all shown</span>
            </label>
            <button class="btn small" (click)="downloadSelectedZip()" [disabled]="!selectedCount || bulkBusy">
              {{ bulkBusy ? 'Preparing ZIP…' : 'Download selected (' + selectedCount + ') as ZIP' }}
            </button>
          </div>
          <div class="inv-list">
            <div class="inv-row" *ngFor="let s of filteredInvoices">
              <input type="checkbox" [checked]="selectedNos.has(s.invoiceNo)" (change)="toggleSelect(s.invoiceNo)">
              <div class="inv-label">
                <strong>{{ s.invoiceNo }}</strong> · {{ s.dateDisplay }} · {{ s.customer.name }} · ₹{{ s.total }}
              </div>
              <div class="inv-actions">
                <button class="btn small" (click)="loadInvoice(s.invoiceNo)" [disabled]="loadingEntry">Load</button>
                <button class="btn small ghost dark" (click)="copyInvoice(s)">Copy</button>
              </div>
            </div>
            <p class="status empty" *ngIf="!filteredInvoices.length">
              No saved invoices{{ invoiceFilter ? ' match the filter' : ' yet' }}.
            </p>
          </div>
          <p class="status"><strong>Load</strong> = edit &amp; update in place ·
            <strong>Copy</strong> = same details with the next invoice number and today's date.</p>
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
          <p class="warn" *ngIf="overwriteRisk">
            ⚠ Invoice {{ inv.invoiceNo }} already exists — saving will overwrite it.
          </p>
        </section>

        <section class="card">
          <h2>Vehicles</h2>
          <div class="row-line" *ngFor="let v of inv.vehicles; let i = index">
            <label>Vehicle No <input [(ngModel)]="v.vehicleNo" (ngModelChange)="onChange()"></label>
            <label>Vehicle Type
              <input [(ngModel)]="v.vehicleType" (ngModelChange)="onChange()" list="vehTypes" placeholder="FTL / 20FT CNTR …">
            </label>
            <button class="btn small danger" (click)="removeVehicle(i)" [disabled]="inv.vehicles.length === 1">×</button>
          </div>
          <button class="btn add small" (click)="addVehicle()">+ Add vehicle</button>
          <datalist id="vehTypes">
            <option value="FTL"></option><option value="LTL"></option>
            <option value="PTL"></option><option value="ODC"></option>
            <option value="20FT CNTR"></option><option value="40FT CNTR"></option>
            <option value="32FT CNTR"></option><option value="32FT MXL"></option>
            <option value="TROLLEY"></option><option value="TRAILER"></option>
          </datalist>
        </section>

        <section class="card">
          <h2>Bill to (customer)</h2>
          <label class="full" style="margin-top:0">Select client
            <select [(ngModel)]="selectedClient" (ngModelChange)="onClientSelect($event)">
              <option value="">— Manual entry —</option>
              <option *ngFor="let cl of clients" [value]="cl.name">{{ cl.name }}</option>
            </select>
          </label>
          <div class="grid g2" style="margin-top:10px">
            <label>Name <input [(ngModel)]="inv.customer.name" (ngModelChange)="onCustomerEdit()"></label>
            <label>GST No <input [(ngModel)]="inv.customer.gstNo" (ngModelChange)="onCustomerEdit()"></label>
            <label>Address line 1 <input [(ngModel)]="inv.customer.addressLine1" (ngModelChange)="onCustomerEdit()"></label>
            <label>Address line 2 <input [(ngModel)]="inv.customer.addressLine2" (ngModelChange)="onCustomerEdit()"></label>
          </div>
          <button class="btn add small" style="margin-top:10px" *ngIf="!selectedClient"
                  (click)="addCurrentCustomerAsClient(clientsPanel)">+ Save this bill-to as a client</button>
        </section>

        <details class="card" #clientsPanel>
          <summary><h2 class="inline">Manage clients ({{ clients.length }})</h2></summary>
          <div class="client-list">
            <div class="client-row" *ngFor="let cl of clients">
              <div class="client-info">
                <strong>{{ cl.name }}</strong>
                <span *ngIf="cl.gstNo">GST: {{ cl.gstNo }}</span>
              </div>
              <button class="btn small" (click)="startEditClient(cl)" [disabled]="cl.id == null">Edit</button>
              <button class="btn small danger" (click)="deleteClientRow(cl)" [disabled]="cl.id == null">×</button>
            </div>
          </div>
          <button class="btn add small" *ngIf="!clientForm" (click)="startAddClient()">+ Add client</button>
          <div class="client-editor" *ngIf="clientForm">
            <h3>{{ clientForm.id != null ? 'Edit client' : 'New client' }}</h3>
            <div class="grid g2">
              <label>Name <input [(ngModel)]="clientForm.name"></label>
              <label>GST No <input [(ngModel)]="clientForm.gstNo"></label>
              <label>Address line 1 <input [(ngModel)]="clientForm.addressLine1"></label>
              <label>Address line 2 <input [(ngModel)]="clientForm.addressLine2"></label>
            </div>
            <div class="grid g2" style="margin-top:8px">
              <button class="btn save" (click)="saveClientForm()" [disabled]="clientBusy">
                {{ clientBusy ? 'Saving…' : 'Save client' }}
              </button>
              <button class="btn ghost dark" (click)="cancelClientForm()">Cancel</button>
            </div>
          </div>
          <p class="status">Deleting a client does not change any saved invoice.</p>
        </details>

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
    .btn.save { background: #1f8a4c; color: #fff; }
    .btn.ghost.dark { color: #1a2b49; border-color: #1a2b49; }
    .restorebtn { font-size: 13px; font-weight: 600; color: #1a2b49; cursor: pointer;
      border: 1px dashed #1a2b49; border-radius: 4px; padding: 8px 12px; text-align: center; }
    .restorebtn input { display: none; }
    .status { font-size: 12px; color: #45556b; margin: 8px 0 0; }
    .status.empty { padding: 10px; margin: 0; }
    .warn { color: #b7791f; font-size: 12.5px; font-weight: 600; margin: 8px 0 0; }
    .btn:disabled { opacity: .4; cursor: not-allowed; }

    .login-page { display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh; padding: 20px; }
    .login-card { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 12px; }
    .login-card h1 { font-size: 20px; color: #1a2b49; margin: 0; text-align: center; }
    .login-sub { font-size: 13px; color: #45556b; margin: 0 0 6px; text-align: center; }
    .login-error { font-size: 12.5px; color: #c0392b; font-weight: 600; margin: 0; }

    .errorbar { background: #fdecea; border: 1px solid #e74c3c; color: #96281b;
      margin: 12px 20px 0; padding: 10px 14px; border-radius: 6px; font-size: 13px; }
    .errorbar ul { margin: 6px 0 0 18px; padding: 0; }

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

    /* Saved-invoice list */
    .inv-toolbar { display: flex; justify-content: space-between; align-items: center;
      gap: 10px; margin: 10px 0 8px; flex-wrap: wrap; }
    .inv-list { max-height: 280px; overflow-y: auto; border: 1px solid #e3e8ef; border-radius: 6px; }
    .inv-row { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center;
      padding: 6px 8px; border-bottom: 1px solid #eef1f4; font-size: 12.5px; color: #1a2b49; }
    .inv-row:last-child { border-bottom: none; }
    .inv-row input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; }
    .inv-actions { display: flex; gap: 6px; }

    /* Client manager */
    .client-list { margin-bottom: 8px; }
    .client-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center;
      padding: 6px 0; border-bottom: 1px solid #eef1f4; font-size: 12.5px; color: #1a2b49; }
    .client-info { display: flex; flex-direction: column; }
    .client-info span { color: #45556b; font-size: 11px; }
    .client-editor { margin-top: 10px; border-top: 1px dashed #c8d0da; padding-top: 10px; }
    .client-editor h3 { font-size: 12px; margin: 0 0 8px; color: #1a2b49;
      text-transform: uppercase; letter-spacing: .05em; }

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
      .errorbar { margin: 10px; }

      .row-line { grid-template-columns: 1fr; gap: 6px; position: relative;
        border: 1px solid #e3e8ef; border-radius: 6px; padding: 10px; padding-top: 12px; }
      .row-line .btn.danger { position: absolute; top: 6px; right: 6px;
        width: 30px; height: 30px; padding: 0; line-height: 1; }

      .inv-row { grid-template-columns: auto 1fr; }
      .inv-actions { grid-column: 1 / -1; }
      .inv-actions .btn { flex: 1; }

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
  clients: StoredClient[] = CLIENTS;
  selectedClient = '';
  saving = false;
  reporting = false;
  fyReporting = false;
  dbStatus = '';
  savedInvoices: StoredInvoice[] = [];
  loadingEntry = false;
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth() + 1;
  months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  fyStart = this.currentFyStart();
  fyYears = Array.from({ length: 5 }, (_, i) => this.currentFyStart() - i);

  /** Invoice no last loaded from / saved to the DB — editing that one is not an "overwrite". */
  loadedInvoiceNo: string | null = null;
  validationErrors: string[] = [];

  // saved-invoice list state
  invoiceFilter = '';
  selectedNos = new Set<string>();
  bulkBusy = false;

  // client manager state
  clientForm: StoredClient | null = null;
  clientBusy = false;

  // auth state: null = checking stored session, false = must log in, true = in
  authed: boolean | null = null;
  loginEmail = '';
  loginPassword = '';
  loginBusy = false;
  loginError = '';

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
    this.checkAuth();
  }

  // ---------------- AUTH ----------------
  private async checkAuth(): Promise<void> {
    try {
      this.authed = !!(await this.data.getSession());
    } catch {
      this.authed = false;
    }
    if (this.authed) { this.initData(); }
  }

  async login(): Promise<void> {
    this.loginBusy = true; this.loginError = '';
    try {
      const err = await this.data.signIn(this.loginEmail.trim(), this.loginPassword);
      if (err) { this.loginError = err; return; }
      this.loginPassword = '';
      this.authed = true;
      this.initData();
    } catch (e: any) {
      this.loginError = e?.message ?? 'Sign-in failed — check your connection.';
    } finally {
      this.loginBusy = false;
    }
  }

  async logout(): Promise<void> {
    await this.data.signOut();
    this.authed = false;
  }

  /** Everything that needs the database, run once after sign-in. */
  private initData(): void {
    this.refreshPreview();
    this.loadClientsFromDb();
    this.initFromDb();
  }

  /** Load the saved list, then pre-fill the next free invoice number. */
  private async initFromDb(): Promise<void> {
    await this.loadSavedInvoices();
    const next = this.nextInvoiceNo();
    if (next && this.loadedInvoiceNo === null) {
      this.inv.invoiceNo = next;
      this.refreshPreview();
    }
  }

  /** True when the current invoice number already exists in the database. */
  get isExisting(): boolean {
    return this.savedInvoices.some(s => s.invoiceNo === this.inv.invoiceNo);
  }

  /** Existing number that was NOT explicitly loaded → saving would silently overwrite. */
  get overwriteRisk(): boolean {
    return this.isExisting && this.inv.invoiceNo !== this.loadedInvoiceNo;
  }

  /** Highest numeric invoice number in the DB + 1 (falls back to the current one). */
  private nextInvoiceNo(): string {
    const nums = this.savedInvoices
      .map(s => (s.invoiceNo ?? '').trim())
      .filter(no => /^\d+$/.test(no))
      .map(no => parseInt(no, 10));
    return nums.length ? String(Math.max(...nums) + 1) : this.inv.invoiceNo;
  }

  // ---------------- SAVED INVOICE LIST ----------------
  async loadSavedInvoices(): Promise<void> {
    try {
      this.savedInvoices = await this.data.listRecent(200);
    } catch {
      this.savedInvoices = [];
    }
  }

  get filteredInvoices(): StoredInvoice[] {
    const q = this.invoiceFilter.trim().toLowerCase();
    if (!q) { return this.savedInvoices; }
    return this.savedInvoices.filter(s =>
      (s.invoiceNo ?? '').toLowerCase().includes(q) ||
      (s.customer?.name ?? '').toLowerCase().includes(q) ||
      (s.dateDisplay ?? '').toLowerCase().includes(q));
  }

  get selectedCount(): number { return this.selectedNos.size; }

  get allFilteredSelected(): boolean {
    const shown = this.filteredInvoices;
    return shown.length > 0 && shown.every(s => this.selectedNos.has(s.invoiceNo));
  }

  toggleSelect(no: string): void {
    if (this.selectedNos.has(no)) { this.selectedNos.delete(no); }
    else { this.selectedNos.add(no); }
  }

  toggleAllFiltered(): void {
    const deselect = this.allFilteredSelected;
    this.filteredInvoices.forEach(s =>
      deselect ? this.selectedNos.delete(s.invoiceNo) : this.selectedNos.add(s.invoiceNo));
  }

  /** Bulk download: every ticked invoice as a PDF inside one ZIP. */
  async downloadSelectedZip(): Promise<void> {
    const sel = this.savedInvoices.filter(s => this.selectedNos.has(s.invoiceNo));
    if (!sel.length) { this.dbStatus = 'Tick at least one invoice first.'; return; }
    this.bulkBusy = true; this.dbStatus = '';
    try {
      const zip = new JSZip();
      sel.forEach(s => {
        const inv = this.data.rowToInvoice(s, { ...this.inv.company });
        const safeNo = s.invoiceNo.replace(/[\\/:*?"<>|]/g, '-');
        zip.file(`Invoice_${safeNo}.pdf`, this.pdf.blob(inv));
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `Invoices_${new Date().toISOString().slice(0, 10)}.zip`);
      this.dbStatus = `Downloaded ${sel.length} invoice PDF(s) as a ZIP.`;
    } catch (e: any) {
      this.dbStatus = 'Bulk download failed: ' + (e?.message ?? 'unknown error.');
    } finally {
      this.bulkBusy = false;
    }
  }

  /** Pull a saved invoice from the DB and populate every field of the form. */
  async loadInvoice(invoiceNo: string): Promise<void> {
    this.loadingEntry = true; this.dbStatus = '';
    try {
      const rec = await this.data.getInvoice(invoiceNo);
      if (!rec) { this.dbStatus = 'Invoice not found.'; return; }
      // Keep the currently-loaded company header; replace everything else.
      this.inv = this.data.rowToInvoice(rec, { ...this.inv.company });
      this.loadedInvoiceNo = rec.invoiceNo;
      this.onCustomerEdit();          // sync the client dropdown to the loaded customer
      this.updateWords();
      this.refreshPreview();
      this.dbStatus = `Loaded invoice ${rec.invoiceNo}. Edit and press “Update entry” to save changes.`;
    } catch (e: any) {
      this.dbStatus = 'Load failed: ' + (e?.message ?? 'check your Supabase config / connection.');
    } finally {
      this.loadingEntry = false;
    }
  }

  /** Duplicate a saved invoice: same details, next invoice number, today's date. */
  copyInvoice(s: StoredInvoice): void {
    this.inv = this.data.rowToInvoice(s, { ...this.inv.company });
    this.inv.invoiceNo = this.nextInvoiceNo();
    this.inv.date = this.today();
    this.loadedInvoiceNo = null;
    this.onCustomerEdit();
    this.updateWords();
    this.refreshPreview();
    this.dbStatus = `Copied invoice ${s.invoiceNo} → new invoice ${this.inv.invoiceNo}. Edit and press “Save entry”.`;
  }

  // ---------------- CLIENT MANAGER ----------------
  /** Seed the client table once, then load from it. */
  async loadClientsFromDb(): Promise<void> {
    try {
      await this.data.seedClientsIfEmpty(CLIENTS);
      const list = await this.data.listClients();
      if (list.length) { this.clients = list; }
    } catch {
      // keep the bundled CLIENTS list
    }
  }

  startAddClient(): void {
    this.clientForm = { name: '', addressLine1: '', addressLine2: '', gstNo: '' };
  }

  startEditClient(cl: StoredClient): void {
    this.clientForm = { ...cl };
  }

  cancelClientForm(): void {
    this.clientForm = null;
  }

  /** Prefill the client editor with the current bill-to and open the panel. */
  addCurrentCustomerAsClient(panel: HTMLDetailsElement): void {
    this.clientForm = { ...this.inv.customer };
    panel.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async saveClientForm(): Promise<void> {
    if (!this.clientForm) { return; }
    if (!this.clientForm.name.trim()) { this.dbStatus = 'Client name is required.'; return; }
    this.clientBusy = true; this.dbStatus = '';
    try {
      if (this.clientForm.id != null) { await this.data.updateClient(this.clientForm); }
      else { await this.data.addClient(this.clientForm); }
      const name = this.clientForm.name;
      this.clientForm = null;
      await this.loadClientsFromDb();
      this.dbStatus = `Client "${name}" saved.`;
    } catch (e: any) {
      this.dbStatus = 'Client save failed: ' + (e?.message ?? 'check your Supabase config / connection.');
    } finally {
      this.clientBusy = false;
    }
  }

  async deleteClientRow(cl: StoredClient): Promise<void> {
    if (cl.id == null) { return; }
    if (!confirm(`Delete client "${cl.name}"? Saved invoices are not affected.`)) { return; }
    this.clientBusy = true; this.dbStatus = '';
    try {
      await this.data.deleteClient(cl.id);
      await this.loadClientsFromDb();
      this.clients = this.clients.filter(c => c.id !== cl.id);
      this.dbStatus = `Client "${cl.name}" deleted.`;
    } catch (e: any) {
      this.dbStatus = 'Client delete failed: ' + (e?.message ?? 'check your Supabase config / connection.');
    } finally {
      this.clientBusy = false;
    }
  }

  // ---------------- BACKUP / REPORTS ----------------
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
      await this.loadSavedInvoices();
      this.dbStatus = 'Backup restored.';
    } catch (e: any) {
      this.dbStatus = 'Restore failed: ' + (e?.message ?? 'invalid file.');
    } finally {
      input.value = '';
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

  async downloadFyReport(): Promise<void> {
    this.fyReporting = true; this.dbStatus = '';
    try {
      const rows = await this.data.listByFinancialYear(this.fyStart);
      if (!rows.length) { this.dbStatus = 'No invoices found for that financial year.'; return; }
      await this.report.generateFinancialYear(rows, this.fyStart);
      this.dbStatus = `Generated FY report for ${rows.length} invoice(s).`;
    } catch (e: any) {
      this.dbStatus = 'FY report failed: ' + (e?.message ?? 'unknown error.');
    } finally {
      this.fyReporting = false;
    }
  }

  // ---------------- SAVE + VALIDATION ----------------
  /** Blocking checks run before every save. Returns a list of problems (empty = OK). */
  private validate(): string[] {
    const errs: string[] = [];
    if (!this.inv.invoiceNo?.trim()) { errs.push('Invoice number is required.'); }
    if (!this.isValidDdmmyyyy(this.inv.date)) { errs.push('Invoice date must be a real date in dd.mm.yyyy format.'); }
    if (!this.inv.customer.name?.trim()) { errs.push('Customer name is required.'); }
    const gst = (this.inv.customer.gstNo ?? '').trim();
    if (gst && !/^[0-9A-Z]{15}$/i.test(gst)) { errs.push('Customer GST No must be 15 letters/digits (or left blank).'); }
    if (invoiceTotal(this.inv) <= 0) { errs.push('Total must be greater than zero — check the charge amounts.'); }
    this.inv.charges.forEach((ch, i) => {
      if (!ch.label?.trim() && Number(ch.amount)) { errs.push(`Charge ${i + 1} has an amount but no label.`); }
    });
    this.inv.lrRows.forEach((r, i) => {
      if (r.date?.trim() && !this.isValidDdmmyyyy(r.date)) { errs.push(`L.R. row ${i + 1}: date must be dd.mm.yyyy.`); }
    });
    return errs;
  }

  private isValidDdmmyyyy(s: string): boolean {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((s || '').trim());
    if (!m) { return false; }
    const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
    const d = new Date(yyyy, mm - 1, dd);
    return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
  }

  async saveToDb(): Promise<void> {
    this.validationErrors = this.validate();
    if (this.validationErrors.length) {
      this.dbStatus = 'Not saved — fix the errors shown at the top.';
      return;
    }
    if (this.overwriteRisk &&
        !confirm(`Invoice ${this.inv.invoiceNo} already exists in the database.\nOverwrite it with the current form?`)) {
      return;
    }
    this.saving = true; this.dbStatus = '';
    const wasExisting = this.isExisting;
    try {
      await this.data.saveInvoice(this.inv);
      this.loadedInvoiceNo = this.inv.invoiceNo;
      await this.loadSavedInvoices();
      this.dbStatus = wasExisting
        ? `Updated invoice ${this.inv.invoiceNo}.`
        : `Saved invoice ${this.inv.invoiceNo}.`;
    } catch (e: any) {
      this.dbStatus = 'Save failed: ' + (e?.message ?? 'check your Supabase config / connection.');
    } finally {
      this.saving = false;
    }
  }

  // ---------------- FORM PLUMBING ----------------
  get totalDisplay(): string {
    return formatAmount(invoiceTotal(this.inv));
  }

  /** When a client is picked from the dropdown, fill the customer fields. */
  onClientSelect(name: string): void {
    const cl = this.clients.find(c => c.name === name);
    if (cl) {
      const { id, ...details } = cl;
      this.inv.customer = { ...details };
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
    // once errors are showing, re-check live so they clear as the user fixes them
    if (this.validationErrors.length) { this.validationErrors = this.validate(); }
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
    this.inv.vehicles.push({ vehicleNo: '', vehicleType: '' });
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

  private currentFyStart(): number {
    const d = new Date();
    return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  }

  private today(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
}
