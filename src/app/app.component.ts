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

type Page = 'dashboard' | 'invoice' | 'saved' | 'reports' | 'clients' | 'settings';


interface Toast { id: number; msg: string; kind: 'ok' | 'err' | 'info'; }

interface ClientStat { name: string; count: number; total: number; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="app" [class.dark]="dark">

  <!-- ==================== LOGIN GATE ==================== -->
  <div class="login-page" *ngIf="authed !== true">
    <form class="login-card" (ngSubmit)="login()" *ngIf="authed === false">
      <div class="login-logo">SL</div>
      <h1>{{ inv.company.name }}</h1>
      <p class="login-sub">Invoice Generator — sign in to continue</p>
      <label>E-mail
        <input type="email" name="email" [(ngModel)]="loginEmail" autocomplete="username" required>
      </label>
      <label>Password
        <input type="password" name="password" [(ngModel)]="loginPassword" autocomplete="current-password" required>
      </label>
      <p class="login-error" *ngIf="loginError">{{ loginError }}</p>
      <button class="btn save wide" type="submit" [disabled]="loginBusy || !loginEmail || !loginPassword">
        {{ loginBusy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
    <p class="login-sub" *ngIf="authed === null">Checking session…</p>
  </div>

  <ng-container *ngIf="authed === true">

  <!-- ==================== SIDEBAR ==================== -->
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">SL</div>
      <div class="brand-name">Shriram<br>Logistics</div>
    </div>
    <nav class="nav">
      <button *ngFor="let n of navItems" class="nav-item" [class.active]="page === n.id" (click)="go(n.id)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="n.icon"/></svg>
        <span>{{ n.label }}</span>
      </button>
    </nav>
    <div class="sidebar-foot">
      <button class="nav-item" (click)="toggleTheme()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path *ngIf="!dark" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          <path *ngIf="dark" d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        <span>{{ dark ? 'Light mode' : 'Dark mode' }}</span>
      </button>
      <button class="nav-item" (click)="logout()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        <span>Log out</span>
      </button>
    </div>
  </aside>

  <!-- ==================== MAIN ==================== -->
  <main class="main">

    <!-- ========== DASHBOARD ========== -->
    <section *ngIf="page === 'dashboard'" class="page-wrap">
      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p class="page-sub">{{ todayLong }}</p>
        </div>
        <button class="btn gold" (click)="startNewInvoice()">+ New invoice</button>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">Invoices this month</span>
          <span class="stat-value">{{ monthInvoices.length }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Revenue this month</span>
          <span class="stat-value">₹{{ fmt(monthRevenue) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Revenue FY {{ currentFy }}–{{ (currentFy + 1) % 100 }}</span>
          <span class="stat-value">₹{{ fmt(fyRevenue) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Clients</span>
          <span class="stat-value">{{ clients.length }}</span>
        </div>
      </div>

      <div class="dash-cols">
        <div class="card">
          <div class="card-head">
            <h2>Recent invoices</h2>
            <button class="btn link" (click)="go('saved')">View all →</button>
          </div>
          <div class="recent-list">
            <div class="recent-row" *ngFor="let s of recentInvoices" (click)="loadInvoice(s.invoiceNo)">
              <div class="recent-no">#{{ s.invoiceNo }}</div>
              <div class="recent-info">
                <strong>{{ s.customer.name }}</strong>
                <span>{{ s.dateDisplay }}</span>
              </div>
              <div class="recent-amt">₹{{ fmt(s.total) }}</div>
            </div>
            <p class="status empty" *ngIf="!recentInvoices.length">No invoices yet — create your first one.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Top clients (this FY)</h2></div>
          <div class="topclient-list">
            <div class="topclient-row" *ngFor="let c of topClients; let i = index">
              <span class="rank">{{ i + 1 }}</span>
              <div class="recent-info">
                <strong>{{ c.name }}</strong>
                <span>{{ c.count }} invoice{{ c.count === 1 ? '' : 's' }}</span>
              </div>
              <div class="recent-amt">₹{{ fmt(c.total) }}</div>
            </div>
            <p class="status empty" *ngIf="!topClients.length">No data for this financial year yet.</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Quick actions</h2></div>
        <div class="quick-grid">
          <button class="quick" (click)="startNewInvoice()"><strong>New invoice</strong><span>Start a blank invoice with the next number</span></button>
          <button class="quick" (click)="go('reports')"><strong>Monthly report</strong><span>Excel summary for any month</span></button>
          <button class="quick" (click)="go('clients')"><strong>Manage clients</strong><span>Add or edit billing clients</span></button>
          <button class="quick" (click)="backup()"><strong>Backup data</strong><span>Download everything as JSON</span></button>
        </div>
      </div>
    </section>

    <!-- ========== INVOICE EDITOR ========== -->
    <section *ngIf="page === 'invoice'" class="page-wrap wide">
      <div class="page-head">
        <div>
          <h1>{{ isExisting && inv.invoiceNo === loadedInvoiceNo ? 'Edit invoice #' + inv.invoiceNo : 'New invoice' }}</h1>
          <p class="page-sub">Changes update the preview automatically</p>
        </div>
        <div class="actions">
          <button class="btn ghost" (click)="refreshPreview()">Refresh preview</button>
          <button class="btn" (click)="downloadPdf()">PDF</button>
          <button class="btn" (click)="downloadExcel()">Excel</button>
          <button class="btn save" (click)="saveToDb()">{{ saving ? 'Saving…' : (isExisting ? 'Update entry' : 'Save entry') }}</button>
        </div>
      </div>

      <div class="errorbar" *ngIf="validationErrors.length">
        <strong>Cannot save yet — fix these first:</strong>
        <ul><li *ngFor="let e of validationErrors">{{ e }}</li></ul>
      </div>

      <div class="layout">
        <div class="form-pane">

          <section class="card">
            <h2>Invoice details</h2>
            <div class="grid g2">
              <label>Invoice No <input [(ngModel)]="inv.invoiceNo" (ngModelChange)="onChange()"></label>
              <label>Date (dd.mm.yyyy) <input [(ngModel)]="inv.date" (ngModelChange)="onChange()"></label>
            </div>
            <p class="warn" *ngIf="overwriteRisk">
              ⚠ Invoice {{ inv.invoiceNo }} already exists — saving will overwrite it.
            </p>
            <label class="checkbox-row" style="margin-top:10px">
              <input type="checkbox" [(ngModel)]="inv.bothCopies" (ngModelChange)="onChange()">
              <span>Print both ORIGINAL & DUPLICATE (uncheck for ORIGINAL only)</span>
            </label>
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
                    (click)="addCurrentCustomerAsClient()">+ Save this bill-to as a client</button>
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
        </div>

        <div class="preview-pane">
          <iframe *ngIf="previewSrc" [src]="previewSrc" title="Invoice preview"></iframe>
        </div>
      </div>
    </section>

    <!-- ========== SAVED INVOICES ========== -->
    <section *ngIf="page === 'saved'" class="page-wrap">
      <div class="page-head">
        <div>
          <h1>Saved invoices</h1>
          <p class="page-sub">{{ savedInvoices.length }} invoice{{ savedInvoices.length === 1 ? '' : 's' }} in the database</p>
        </div>
        <button class="btn gold" (click)="startNewInvoice()">+ New invoice</button>
      </div>

      <div class="card">
        <div class="inv-toolbar">
          <input class="searchbox" [(ngModel)]="invoiceFilter" placeholder="Search by invoice no / customer / date">
          <label class="checkbox-row">
            <input type="checkbox" [checked]="allFilteredSelected" (change)="toggleAllFiltered()">
            <span>Select all shown</span>
          </label>
          <button class="btn small" (click)="downloadSelectedZip()" [disabled]="!selectedCount || bulkBusy">
            {{ bulkBusy ? 'Preparing ZIP…' : 'ZIP (' + selectedCount + ')' }}
          </button>
        </div>
        <div class="inv-list">
          <div class="inv-row" *ngFor="let s of filteredInvoices">
            <input type="checkbox" [checked]="selectedNos.has(s.invoiceNo)" (change)="toggleSelect(s.invoiceNo)">
            <div class="inv-label">
              <strong>#{{ s.invoiceNo }}</strong>
              <span class="inv-meta">{{ s.dateDisplay }} · {{ s.customer.name }}</span>
            </div>
            <div class="inv-amt">₹{{ fmt(s.total) }}</div>
            <div class="inv-actions">
              <button class="btn small" (click)="loadInvoice(s.invoiceNo)" [disabled]="loadingEntry">Edit</button>
              <button class="btn small ghost dark" (click)="copyInvoice(s)">Copy</button>
              <button class="btn small danger" (click)="deleteInvoiceRow(s)">×</button>
            </div>
          </div>
          <p class="status empty" *ngIf="!filteredInvoices.length">
            No saved invoices{{ invoiceFilter ? ' match the search' : ' yet' }}.
          </p>
        </div>
        <p class="status"><strong>Edit</strong> = open & update in place ·
          <strong>Copy</strong> = same details with the next invoice number and today's date.</p>
      </div>
    </section>

    <!-- ========== REPORTS ========== -->
    <section *ngIf="page === 'reports'" class="page-wrap">
      <div class="page-head">
        <div>
          <h1>Reports & backup</h1>
          <p class="page-sub">Excel / PDF summaries and data backup</p>
        </div>
      </div>

      <div class="report-grid">
        <div class="card">
          <h2>Monthly report</h2>
          <p class="status" style="margin:0 0 10px">All invoices of one calendar month as an Excel sheet.</p>
          <div class="grid g2">
            <label>Year <input type="number" [(ngModel)]="reportYear"></label>
            <label>Month
              <select [(ngModel)]="reportMonth">
                <option *ngFor="let m of months; let i = index" [value]="i+1">{{ m }}</option>
              </select>
            </label>
          </div>
          <button class="btn wide" style="margin-top:12px" (click)="downloadMonthlyReport()">
            {{ reporting ? 'Working…' : 'Download monthly Excel' }}
          </button>
        </div>

        <div class="card">
          <h2>Financial year report</h2>
          <p class="status" style="margin:0 0 10px">Complete April–March summary as an Excel sheet.</p>
          <label class="full" style="margin-top:0">Financial year
            <select [(ngModel)]="fyStart">
              <option *ngFor="let y of fyYears" [ngValue]="y">Apr {{ y }} – Mar {{ y + 1 }}</option>
            </select>
          </label>
          <button class="btn wide" style="margin-top:12px" (click)="downloadFyReport()">
            {{ fyReporting ? 'Working…' : 'Download FY Excel' }}
          </button>
        </div>

        <div class="card">
          <h2>Client-wise statement</h2>
          <p class="status" style="margin:0 0 10px">Every invoice of one client, for any date range.</p>
          <label class="full" style="margin-top:0">Client
            <select [(ngModel)]="reportClient">
              <option value="">— Select a client —</option>
              <option *ngFor="let n of clientReportNames" [value]="n">{{ n }}</option>
            </select>
          </label>
          <div class="grid g2" style="margin-top:10px">
            <label>From (blank = beginning) <input type="date" [(ngModel)]="reportFrom"></label>
            <label>To (blank = today) <input type="date" [(ngModel)]="reportTo"></label>
          </div>
          <div class="grid g2" style="margin-top:12px">
            <button class="btn" (click)="downloadClientReport('excel')" [disabled]="!reportClient || clientReporting">
              {{ clientReporting ? 'Working…' : 'Excel' }}
            </button>
            <button class="btn" (click)="downloadClientReport('pdf')" [disabled]="!reportClient || clientReporting">
              {{ clientReporting ? 'Working…' : 'PDF' }}
            </button>
          </div>
        </div>

        <div class="card">
          <h2>Backup & restore</h2>
          <p class="status" style="margin:0 0 10px">Download everything as JSON, or restore from a backup file.</p>
          <div class="grid g2">
            <button class="btn ghost dark" (click)="backup()">Backup all (JSON)</button>
            <label class="restorebtn">Restore from backup
              <input type="file" accept="application/json" (change)="restore($event)">
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== CLIENTS ========== -->
    <section *ngIf="page === 'clients'" class="page-wrap">
      <div class="page-head">
        <div>
          <h1>Clients</h1>
          <p class="page-sub">{{ clients.length }} saved billing client{{ clients.length === 1 ? '' : 's' }}</p>
        </div>
        <button class="btn gold" *ngIf="!clientForm" (click)="startAddClient()">+ Add client</button>
      </div>

      <div class="card client-editor" *ngIf="clientForm">
        <h2>{{ clientForm.id != null ? 'Edit client' : 'New client' }}</h2>
        <div class="grid g2">
          <label>Name <input [(ngModel)]="clientForm.name"></label>
          <label>GST No <input [(ngModel)]="clientForm.gstNo"></label>
          <label>Address line 1 <input [(ngModel)]="clientForm.addressLine1"></label>
          <label>Address line 2 <input [(ngModel)]="clientForm.addressLine2"></label>
        </div>
        <div class="grid g2" style="margin-top:12px">
          <button class="btn save" (click)="saveClientForm()" [disabled]="clientBusy">
            {{ clientBusy ? 'Saving…' : 'Save client' }}
          </button>
          <button class="btn ghost dark" (click)="cancelClientForm()">Cancel</button>
        </div>
      </div>

      <div class="card">
        <div class="client-list">
          <div class="client-row" *ngFor="let cl of clients">
            <div class="client-avatar">{{ clientInitials(cl.name) }}</div>
            <div class="client-info">
              <strong>{{ cl.name }}</strong>
              <span *ngIf="cl.gstNo">GST: {{ cl.gstNo }}</span>
              <span *ngIf="cl.addressLine1">{{ cl.addressLine1 }}</span>
            </div>
            <button class="btn small" (click)="startEditClient(cl)" [disabled]="cl.id == null">Edit</button>
            <button class="btn small danger" (click)="deleteClientRow(cl)" [disabled]="cl.id == null">×</button>
          </div>
        </div>
        <p class="status">Deleting a client does not change any saved invoice.</p>
      </div>
    </section>

    <!-- ========== SETTINGS ========== -->
    <section *ngIf="page === 'settings'" class="page-wrap">
      <div class="page-head">
        <div>
          <h1>Settings</h1>
          <p class="page-sub">Company details and app preferences</p>
        </div>
      </div>

      <div class="card">
        <h2>Company details (appear on invoices)</h2>
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
      </div>

      <div class="card">
        <h2>Appearance</h2>
        <label class="checkbox-row">
          <input type="checkbox" [checked]="dark" (change)="toggleTheme()">
          <span>Dark mode</span>
        </label>
      </div>

      <div class="card">
        <h2>Account</h2>
        <button class="btn ghost dark" (click)="logout()">Log out</button>
      </div>
    </section>
  </main>

  <!-- ==================== MOBILE BOTTOM NAV ==================== -->
  <nav class="bottomnav">
    <button *ngFor="let n of navItems" [class.active]="page === n.id" (click)="go(n.id)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="n.icon"/></svg>
      <span>{{ n.short }}</span>
    </button>
  </nav>

  </ng-container>

  <!-- ==================== TOASTS ==================== -->
  <div class="toasts">
    <div class="toast" *ngFor="let t of toasts" [class.ok]="t.kind === 'ok'" [class.err]="t.kind === 'err'">
      {{ t.msg }}
    </div>
  </div>

  </div>
  `,
  styles: [`
    :host { display: block; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }

    .app {
      --bg: #fafafa;
      --card: #ffffff;
      --text: #18181b;
      --muted: #71717a;
      --border: #e4e4e7;
      --border-soft: #efeff1;
      --navy: #18181b;
      --gold: #18181b;
      --gold-text: #ffffff;
      --green: #16a34a;
      --red: #dc2626;
      --input-bg: #ffffff;
      --readonly-bg: #f4f4f5;
      --shadow: 0 1px 2px rgba(0,0,0,.04);
      --sidebar-bg: #ffffff;
      --sidebar-text: #52525b;
      --nav-active: #f4f4f5;
      --ring: rgba(24,24,27,.12);
      display: flex; min-height: 100vh; background: var(--bg); color: var(--text);
      font-feature-settings: 'cv02','cv03','cv04';
    }
    .app.dark {
      --bg: #09090b;
      --card: #111113;
      --text: #ececee;
      --muted: #9d9da6;
      --border: #27272b;
      --border-soft: #1e1e22;
      --navy: #ececee;
      --gold: #ececee;
      --gold-text: #111113;
      --input-bg: #18181b;
      --readonly-bg: #232326;
      --shadow: 0 1px 2px rgba(0,0,0,.4);
      --sidebar-bg: #111113;
      --sidebar-text: #9d9da6;
      --nav-active: #232326;
      --ring: rgba(236,236,238,.14);
    }

    /* ---------------- SIDEBAR ---------------- */
    .sidebar { width: 232px; background: var(--sidebar-bg); color: var(--sidebar-text);
      display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; flex: none;
      border-right: 1px solid var(--border-soft); }
    .brand { display: flex; align-items: center; gap: 10px; padding: 20px 16px 14px; }
    .brand-mark { width: 32px; height: 32px; border-radius: 8px; background: var(--text);
      color: var(--card); font-weight: 700; font-size: 13px; display: flex; align-items: center;
      justify-content: center; flex: none; letter-spacing: -.02em; }
    .brand-name { color: var(--text); font-weight: 600; font-size: 13px; line-height: 1.3;
      letter-spacing: -.01em; }
    .nav { display: flex; flex-direction: column; gap: 1px; padding: 10px 10px; flex: 1; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
      background: transparent; border: none; color: var(--sidebar-text); font-size: 13px;
      font-weight: 500; border-radius: 7px; cursor: pointer; text-align: left; width: 100%;
      font-family: inherit; transition: background .12s, color .12s; }
    .nav-item svg { width: 16px; height: 16px; flex: none; opacity: .75; }
    .nav-item:hover { background: var(--nav-active); color: var(--text); }
    .nav-item.active { background: var(--nav-active); color: var(--text); font-weight: 600; }
    .nav-item.active svg { opacity: 1; }
    .sidebar-foot { padding: 10px 10px 14px; border-top: 1px solid var(--border-soft);
      display: flex; flex-direction: column; gap: 1px; }

    /* ---------------- MAIN ---------------- */
    .main { flex: 1; min-width: 0; }
    .page-wrap { max-width: 1020px; margin: 0 auto; padding: 32px 28px 90px; }
    .page-wrap.wide { max-width: 1500px; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-end;
      gap: 14px; margin-bottom: 22px; flex-wrap: wrap; }
    .page-head h1 { font-size: 20px; margin: 0; font-weight: 600; letter-spacing: -.02em; }
    .page-sub { font-size: 13px; color: var(--muted); margin: 4px 0 0; font-weight: 400; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }

    /* ---------------- BUTTONS ---------------- */
    .btn { background: var(--card); color: var(--text); border: 1px solid var(--border);
      padding: 7px 14px; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 13px;
      font-family: inherit; transition: background .12s, border-color .12s; box-shadow: var(--shadow); }
    .btn:hover { background: var(--readonly-bg); }
    .btn.gold { background: var(--text); color: var(--card); border-color: var(--text); font-weight: 600; }
    .btn.gold:hover { opacity: .88; background: var(--text); }
    .btn.ghost { background: transparent; color: var(--muted); border: none; box-shadow: none; }
    .btn.ghost:hover { color: var(--text); background: var(--nav-active); }
    .btn.ghost.dark { color: var(--muted); }
    .btn.small { padding: 4px 10px; font-size: 12px; border-radius: 6px; }
    .btn.add { background: transparent; color: var(--muted); border: 1px dashed var(--border);
      margin-top: 4px; box-shadow: none; }
    .btn.add:hover { border-color: var(--text); color: var(--text); background: transparent; }
    .btn.danger { background: transparent; color: var(--red); border: 1px solid var(--border); box-shadow: none; }
    .btn.danger:hover { background: var(--red); border-color: var(--red); color: #fff; }
    .btn.save { background: var(--text); color: var(--card); border-color: var(--text); font-weight: 600; }
    .btn.save:hover { opacity: .88; background: var(--text); }
    .btn.link { background: none; border: none; color: var(--muted); padding: 0; font-size: 12.5px;
      box-shadow: none; }
    .btn.link:hover { color: var(--text); background: none; }
    .btn.wide { width: 100%; }
    .btn:disabled { opacity: .4; cursor: not-allowed; }
    .restorebtn { font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer;
      border: 1px dashed var(--border); border-radius: 8px; padding: 8px 12px; text-align: center; }
    .restorebtn:hover { border-color: var(--text); color: var(--text); }
    .restorebtn input { display: none; }

    /* ---------------- CARDS ---------------- */
    .card { background: var(--card); border-radius: 10px; padding: 18px 20px;
      margin-bottom: 14px; box-shadow: var(--shadow); border: 1px solid var(--border); }
    .card h2 { font-size: 13px; color: var(--text); margin: 0 0 14px; font-weight: 600;
      letter-spacing: -.01em; }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .card-head h2 { margin: 0; }

    /* ---------------- DASHBOARD ---------------- */
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
    .stat-card { background: var(--card); border-radius: 10px; padding: 16px 18px;
      box-shadow: var(--shadow); border: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 8px; }
    .stat-label { font-size: 12px; color: var(--muted); font-weight: 500; }
    .stat-value { font-size: 24px; font-weight: 600; letter-spacing: -.03em;
      font-variant-numeric: tabular-nums; }
    .dash-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .recent-row, .topclient-row { display: flex; align-items: center; gap: 12px;
      padding: 10px 4px; border-bottom: 1px solid var(--border-soft); }
    .recent-row { cursor: pointer; border-radius: 6px; }
    .recent-row:hover { background: var(--nav-active); }
    .recent-row:last-child, .topclient-row:last-child { border-bottom: none; }
    .recent-no { font-weight: 600; font-size: 12px; color: var(--muted); min-width: 44px;
      font-variant-numeric: tabular-nums; }
    .recent-info { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
    .recent-info strong { display: block; font-size: 13px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recent-info span { display: block; font-size: 12px; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recent-amt { font-weight: 600; font-size: 13px; white-space: nowrap;
      font-variant-numeric: tabular-nums; }
    .rank { width: 20px; height: 20px; border-radius: 6px; background: var(--readonly-bg);
      color: var(--muted); font-size: 11px; font-weight: 600; display: flex;
      align-items: center; justify-content: center; flex: none; }
    .quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .quick { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      padding: 14px; cursor: pointer; text-align: left; font-family: inherit;
      display: flex; flex-direction: column; gap: 3px; color: var(--text);
      transition: background .12s; box-shadow: var(--shadow); }
    .quick:hover { background: var(--nav-active); }
    .quick strong { font-size: 13px; font-weight: 600; }
    .quick span { font-size: 12px; color: var(--muted); font-weight: 400; }

    /* ---------------- FORM ---------------- */
    .layout { display: grid; grid-template-columns: minmax(420px, 1fr) minmax(420px, 1fr); gap: 16px; }
    .grid { display: grid; gap: 10px; }
    .g1 { grid-template-columns: 1fr; }
    .g2 { grid-template-columns: 1fr 1fr; }
    label { display: flex; flex-direction: column; font-size: 12.5px; color: var(--muted);
      gap: 5px; font-weight: 500; }
    label.full { margin-top: 10px; }
    input, select { padding: 8px 11px; border: 1px solid var(--border); border-radius: 8px;
      font-size: 14px; font-family: inherit; width: 100%; background: var(--input-bg);
      color: var(--text); font-weight: 400; transition: border-color .12s, box-shadow .12s; }
    input:focus, select:focus { outline: none; border-color: var(--text);
      box-shadow: 0 0 0 3px var(--ring); }
    input.readonly { background: var(--readonly-bg); font-weight: 600; }
    .row-line { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px;
      align-items: end; margin-bottom: 8px; }
    .checkbox-row { flex-direction: row; align-items: center; gap: 8px; font-size: 13px;
      color: var(--text); cursor: pointer; font-weight: 400; }
    .checkbox-row input { width: 16px; height: 16px; cursor: pointer; flex: none; accent-color: var(--text); }
    .warn { color: #b45309; font-size: 12.5px; font-weight: 500; margin: 8px 0 0; }
    .status { font-size: 12px; color: var(--muted); margin: 8px 0 0; font-weight: 400; }
    .status.empty { padding: 10px 4px; margin: 0; }
    .errorbar { background: rgba(220,38,38,.06); border: 1px solid rgba(220,38,38,.35); color: var(--red);
      margin: 0 0 14px; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
    .errorbar ul { margin: 6px 0 0 18px; padding: 0; }

    /* ---------------- SAVED LIST ---------------- */
    .inv-toolbar { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
    .searchbox { flex: 1; min-width: 200px; }
    .inv-list { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .inv-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center;
      padding: 10px 14px; border-bottom: 1px solid var(--border-soft); font-size: 13px; }
    .inv-row:last-child { border-bottom: none; }
    .inv-row:hover { background: var(--nav-active); }
    .inv-row input[type=checkbox] { width: 15px; height: 15px; cursor: pointer; accent-color: var(--text); }
    .inv-label { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
    .inv-label strong { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .inv-meta { display: block; font-size: 12px; color: var(--muted); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }
    .inv-amt { font-weight: 600; font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .inv-actions { display: flex; gap: 6px; }

    /* ---------------- REPORTS ---------------- */
    .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .report-grid .card { margin-bottom: 0; }

    /* ---------------- CLIENTS ---------------- */
    .client-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px;
      align-items: center; padding: 11px 4px; border-bottom: 1px solid var(--border-soft); }
    .client-row:last-child { border-bottom: none; }
    .client-avatar { width: 32px; height: 32px; border-radius: 8px; background: var(--readonly-bg);
      color: var(--muted); font-size: 11px; font-weight: 600; display: flex; align-items: center;
      justify-content: center; flex: none; }
    .client-info { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
    .client-info strong { display: block; font-size: 13px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .client-info span { display: block; color: var(--muted); font-size: 12px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ---------------- LR TABLE ---------------- */
    .lr-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .lr-table th { font-size: 11px; text-align: left; color: var(--muted); padding: 2px 4px; }
    .lr-table td { padding: 2px 4px; }
    .lr-table input { width: 100%; }

    /* ---------------- PREVIEW ---------------- */
    .preview-pane { position: sticky; top: 16px; height: calc(100vh - 32px); }
    .preview-pane iframe { width: 100%; height: 100%; border: 1px solid var(--border);
      border-radius: 10px; background: #fff; }

    /* ---------------- LOGIN ---------------- */
    .login-page { display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh; padding: 20px; flex: 1; }
    .login-card { width: 100%; max-width: 360px; display: flex; flex-direction: column;
      gap: 12px; background: var(--card); border-radius: 12px; padding: 32px 28px;
      box-shadow: var(--shadow); border: 1px solid var(--border); }
    .login-logo { width: 44px; height: 44px; border-radius: 10px; background: var(--text);
      color: var(--card); font-weight: 700; font-size: 16px; display: flex; align-items: center;
      justify-content: center; margin: 0 auto 6px; }
    .login-card h1 { font-size: 17px; margin: 0; text-align: center; font-weight: 600;
      letter-spacing: -.01em; }
    .login-sub { font-size: 13px; color: var(--muted); margin: 0 0 6px; text-align: center; }
    .login-error { font-size: 12.5px; color: var(--red); font-weight: 500; margin: 0; }

    /* ---------------- TOASTS ---------------- */
    .toasts { position: fixed; bottom: 20px; right: 20px; z-index: 60; display: flex;
      flex-direction: column; gap: 8px; max-width: 340px; }
    .toast { background: var(--text); color: var(--card); padding: 10px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 500; box-shadow: 0 4px 16px rgba(0,0,0,.18);
      animation: slidein .18s ease-out; display: flex; align-items: center; gap: 8px; }
    .toast.ok::before { content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #4ade80; flex: none; }
    .toast.err::before { content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #f87171; flex: none; }
    @keyframes slidein { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }

    /* ---------------- BOTTOM NAV (mobile) ---------------- */
    .bottomnav { display: none; }

    @media (max-width: 900px) {
      .sidebar { display: none; }
      .bottomnav { display: grid; grid-template-columns: repeat(6, 1fr); position: fixed;
        bottom: 0; left: 0; right: 0; background: var(--card); z-index: 50;
        border-top: 1px solid var(--border);
        padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); }
      .bottomnav button { background: none; border: none; color: var(--muted);
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        font-size: 10px; font-weight: 500; font-family: inherit; cursor: pointer;
        padding: 4px 0; border-radius: 8px; }
      .bottomnav button svg { width: 18px; height: 18px; }
      .bottomnav button.active { color: var(--text); font-weight: 600; }
      .page-wrap { padding: 16px 14px 110px; }
      .layout { grid-template-columns: 1fr; }
      .dash-cols, .report-grid { grid-template-columns: 1fr; }
      .stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
      .stat-card { padding: 12px 14px; gap: 4px; }
      .stat-value { font-size: 17px; }
      .card { padding: 14px; }
      .quick-grid { grid-template-columns: 1fr 1fr; }
      .g2 { grid-template-columns: 1fr; }
      .page-head h1 { font-size: 19px; }

      /* dashboard lists: rigid grid so long names truncate instead of overflowing */
      .recent-row, .topclient-row { display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; }
      .recent-no { min-width: 0; }
      .recent-amt { font-size: 12.5px; }
      .topclient-row .recent-amt { grid-column: 3; }
      .actions { width: 100%; }
      .actions .btn { flex: 1; text-align: center; }
      .toasts { bottom: 76px; right: 12px; left: 12px; max-width: none; }

      .row-line { grid-template-columns: 1fr; gap: 6px; position: relative;
        border: 1px solid var(--border-soft); border-radius: 10px; padding: 10px; padding-top: 12px; }
      .row-line .btn.danger { position: absolute; top: 6px; right: 6px;
        width: 30px; height: 30px; padding: 0; line-height: 1; }

      .inv-row { grid-template-columns: auto 1fr auto; }
      .inv-actions { grid-column: 1 / -1; }
      .inv-actions .btn { flex: 1; }

      .lr-table thead { display: none; }
      .lr-table, .lr-table tbody, .lr-table tr, .lr-table td { display: block; width: 100%; }
      .lr-table tr { border: 1px solid var(--border-soft); border-radius: 10px; padding: 10px;
        margin-bottom: 10px; position: relative; }
      .lr-table td { padding: 4px 0; }
      .lr-table td::before { content: attr(data-label); display: block; font-size: 11px;
        color: var(--muted); margin-bottom: 2px; }
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

  // ---------------- NAVIGATION / UI STATE ----------------
  page: Page = 'dashboard';
  dark = false;
  toasts: Toast[] = [];
  private toastSeq = 0;

  navItems: { id: Page; label: string; short: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', short: 'Home',
      icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
    { id: 'invoice', label: 'New invoice', short: 'Invoice',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M12 18v-6M9 15h6' },
    { id: 'saved', label: 'Saved invoices', short: 'Saved',
      icon: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4' },
    { id: 'reports', label: 'Reports', short: 'Reports',
      icon: 'M18 20V10M12 20V4M6 20v-6' },
    { id: 'clients', label: 'Clients', short: 'Clients',
      icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { id: 'settings', label: 'Settings', short: 'Settings',
      icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' }
  ];

  previewSrc: SafeResourceUrl | null = null;
  clients: StoredClient[] = CLIENTS;
  selectedClient = '';
  saving = false;
  reporting = false;
  fyReporting = false;
  savedInvoices: StoredInvoice[] = [];
  loadingEntry = false;
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth() + 1;
  reportClient = '';
  reportFrom = '';   // yyyy-mm-dd (native date input)
  reportTo = '';
  clientReporting = false;
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
    this.initTheme();
    this.checkAuth();
  }

  // ---------------- THEME ----------------
  private initTheme(): void {
    try {
      const stored = localStorage.getItem('sl-theme');
      this.dark = stored ? stored === 'dark'
        : window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch { this.dark = false; }
  }

  toggleTheme(): void {
    this.dark = !this.dark;
    try { localStorage.setItem('sl-theme', this.dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }

  // ---------------- TOASTS ----------------
  toast(msg: string, kind: Toast['kind'] = 'info'): void {
    const t: Toast = { id: ++this.toastSeq, msg, kind };
    this.toasts.push(t);
    setTimeout(() => { this.toasts = this.toasts.filter(x => x.id !== t.id); }, 4200);
  }

  // ---------------- NAVIGATION ----------------
  go(p: Page): void {
    this.page = p;
    if (p === 'invoice') { this.refreshPreview(); }
    window.scrollTo({ top: 0 });
  }

  /** Blank form with the next free invoice number and today's date. */
  startNewInvoice(): void {
    this.inv = {
      company: this.inv.company,
      customer: { name: '', addressLine1: '', addressLine2: '', gstNo: '' },
      invoiceNo: this.nextInvoiceNo(),
      date: this.today(),
      vehicles: [{ vehicleNo: '', vehicleType: '' }],
      charges: [{ label: 'Transportation Charges', amount: 0 }],
      lrRows: [{ lrNo: '', date: '', from: '', to: '', description: '', pkgs: '' }],
      gstNote: DEFAULT_GST_NOTE,
      amountInWords: '',
      digitalSignature: true,
      signatoryName: this.inv.signatoryName,
      bothCopies: true
    };
    this.loadedInvoiceNo = null;
    this.selectedClient = '';
    this.validationErrors = [];
    this.updateWords();
    this.go('invoice');
  }

  // ---------------- DASHBOARD DATA ----------------
  fmt(n: number): string { return formatAmount(Number(n) || 0); }

  get todayLong(): string {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get currentFy(): number { return this.currentFyStart(); }

  get monthInvoices(): StoredInvoice[] {
    const d = new Date();
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return this.savedInvoices.filter(s => (s.isoDate ?? '').startsWith(prefix));
  }

  get monthRevenue(): number {
    return this.monthInvoices.reduce((a, s) => a + (Number(s.total) || 0), 0);
  }

  private get fyInvoices(): StoredInvoice[] {
    const fy = this.currentFyStart();
    const start = `${fy}-04-01`, end = `${fy + 1}-04-01`;
    return this.savedInvoices.filter(s => s.isoDate >= start && s.isoDate < end);
  }

  get fyRevenue(): number {
    return this.fyInvoices.reduce((a, s) => a + (Number(s.total) || 0), 0);
  }

  get topClients(): ClientStat[] {
    const map = new Map<string, ClientStat>();
    this.fyInvoices.forEach(s => {
      const name = s.customer?.name?.trim();
      if (!name) { return; }
      const e = map.get(name) ?? { name, count: 0, total: 0 };
      e.count++; e.total += Number(s.total) || 0;
      map.set(name, e);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }

  get recentInvoices(): StoredInvoice[] {
    return this.savedInvoices.slice(0, 6);
  }

  clientInitials(name: string): string {
    return (name || '')
      .replace(/^M\/S\.?\s*/i, '')
      .split(/\s+/).filter(w => /^[A-Za-z]/.test(w))
      .slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
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
    this.page = 'dashboard';
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
    if (!sel.length) { this.toast('Tick at least one invoice first.', 'err'); return; }
    this.bulkBusy = true;
    try {
      const zip = new JSZip();
      sel.forEach(s => {
        const inv = this.data.rowToInvoice(s, { ...this.inv.company });
        const safeNo = s.invoiceNo.replace(/[\\/:*?"<>|]/g, '-');
        zip.file(`${safeNo}.pdf`, this.pdf.blob(inv));
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `Invoices_${new Date().toISOString().slice(0, 10)}.zip`);
      this.toast(`Downloaded ${sel.length} invoice PDF(s) as a ZIP.`, 'ok');
    } catch (e: any) {
      this.toast('Bulk download failed: ' + (e?.message ?? 'unknown error.'), 'err');
    } finally {
      this.bulkBusy = false;
    }
  }

  /** Pull a saved invoice from the DB and populate every field of the form. */
  async loadInvoice(invoiceNo: string): Promise<void> {
    this.loadingEntry = true;
    try {
      const rec = await this.data.getInvoice(invoiceNo);
      if (!rec) { this.toast('Invoice not found.', 'err'); return; }
      // Keep the currently-loaded company header; replace everything else.
      this.inv = this.data.rowToInvoice(rec, { ...this.inv.company });
      this.loadedInvoiceNo = rec.invoiceNo;
      this.onCustomerEdit();          // sync the client dropdown to the loaded customer
      this.updateWords();
      this.go('invoice');
      this.toast(`Loaded invoice ${rec.invoiceNo} — edit and press "Update entry".`, 'info');
    } catch (e: any) {
      this.toast('Load failed: ' + (e?.message ?? 'check your connection.'), 'err');
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
    this.go('invoice');
    this.toast(`Copied invoice ${s.invoiceNo} → new invoice ${this.inv.invoiceNo}.`, 'info');
  }

  /** Permanently delete a saved invoice (with confirmation). */
  async deleteInvoiceRow(s: StoredInvoice): Promise<void> {
    if (!confirm(`Delete invoice ${s.invoiceNo} (${s.customer?.name ?? ''})?\nThis cannot be undone.`)) { return; }
    try {
      await this.data.deleteInvoice(s.invoiceNo);
      this.selectedNos.delete(s.invoiceNo);
      await this.loadSavedInvoices();
      this.toast(`Deleted invoice ${s.invoiceNo}.`, 'ok');
    } catch (e: any) {
      this.toast('Delete failed: ' + (e?.message ?? 'check your connection.'), 'err');
    }
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelClientForm(): void {
    this.clientForm = null;
  }

  /** Prefill the client editor with the current bill-to and jump to the clients page. */
  addCurrentCustomerAsClient(): void {
    this.clientForm = { ...this.inv.customer };
    this.go('clients');
  }

  async saveClientForm(): Promise<void> {
    if (!this.clientForm) { return; }
    if (!this.clientForm.name.trim()) { this.toast('Client name is required.', 'err'); return; }
    this.clientBusy = true;
    try {
      if (this.clientForm.id != null) { await this.data.updateClient(this.clientForm); }
      else { await this.data.addClient(this.clientForm); }
      const name = this.clientForm.name;
      this.clientForm = null;
      await this.loadClientsFromDb();
      this.toast(`Client "${name}" saved.`, 'ok');
    } catch (e: any) {
      this.toast('Client save failed: ' + (e?.message ?? 'check your connection.'), 'err');
    } finally {
      this.clientBusy = false;
    }
  }

  async deleteClientRow(cl: StoredClient): Promise<void> {
    if (cl.id == null) { return; }
    if (!confirm(`Delete client "${cl.name}"? Saved invoices are not affected.`)) { return; }
    this.clientBusy = true;
    try {
      await this.data.deleteClient(cl.id);
      await this.loadClientsFromDb();
      this.clients = this.clients.filter(c => c.id !== cl.id);
      this.toast(`Client "${cl.name}" deleted.`, 'ok');
    } catch (e: any) {
      this.toast('Client delete failed: ' + (e?.message ?? 'check your connection.'), 'err');
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
    this.toast('Backup downloaded.', 'ok');
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
      this.toast('Backup restored.', 'ok');
    } catch (e: any) {
      this.toast('Restore failed: ' + (e?.message ?? 'invalid file.'), 'err');
    } finally {
      input.value = '';
    }
  }

  async downloadMonthlyReport(): Promise<void> {
    this.reporting = true;
    try {
      const rows: StoredInvoice[] = await this.data.listByMonth(this.reportYear, this.reportMonth);
      if (!rows.length) { this.toast('No invoices found for that month.', 'err'); return; }
      await this.report.generate(rows, this.reportYear, this.reportMonth);
      this.toast(`Generated report for ${rows.length} invoice(s).`, 'ok');
    } catch (e: any) {
      this.toast('Report failed: ' + (e?.message ?? 'unknown error.'), 'err');
    } finally {
      this.reporting = false;
    }
  }

  /** Client names to offer in the statement dropdown: saved clients + every
   *  customer that actually appears on a saved invoice (manual entries too). */
  get clientReportNames(): string[] {
    const names = new Set<string>();
    this.clients.forEach(c => { if (c.name?.trim()) { names.add(c.name); } });
    this.savedInvoices.forEach(s => { if (s.customer?.name?.trim()) { names.add(s.customer.name); } });
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  async downloadClientReport(kind: 'excel' | 'pdf'): Promise<void> {
    if (!this.reportClient) { this.toast('Pick a client first.', 'err'); return; }
    if (this.reportFrom && this.reportTo && this.reportFrom > this.reportTo) {
      this.toast('The "From" date is after the "To" date.', 'err'); return;
    }
    this.clientReporting = true;
    try {
      const rows = await this.data.listByClient(this.reportClient, this.reportFrom, this.reportTo);
      if (!rows.length) { this.toast('No invoices for that client in this period.', 'err'); return; }
      if (kind === 'excel') {
        await this.report.generateClient(rows, this.reportClient, this.reportFrom, this.reportTo);
      } else {
        this.pdf.clientReport(rows, this.reportClient, this.reportFrom, this.reportTo, { ...this.inv.company });
      }
      this.toast(`Generated ${kind === 'excel' ? 'Excel' : 'PDF'} statement: ${rows.length} invoice(s) for ${this.reportClient}.`, 'ok');
    } catch (e: any) {
      this.toast('Client report failed: ' + (e?.message ?? 'unknown error.'), 'err');
    } finally {
      this.clientReporting = false;
    }
  }

  async downloadFyReport(): Promise<void> {
    this.fyReporting = true;
    try {
      const rows = await this.data.listByFinancialYear(this.fyStart);
      if (!rows.length) { this.toast('No invoices found for that financial year.', 'err'); return; }
      await this.report.generateFinancialYear(rows, this.fyStart);
      this.toast(`Generated FY report for ${rows.length} invoice(s).`, 'ok');
    } catch (e: any) {
      this.toast('FY report failed: ' + (e?.message ?? 'unknown error.'), 'err');
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
      this.toast('Not saved — fix the errors shown at the top.', 'err');
      return;
    }
    if (this.overwriteRisk &&
        !confirm(`Invoice ${this.inv.invoiceNo} already exists in the database.\nOverwrite it with the current form?`)) {
      return;
    }
    this.saving = true;
    const wasExisting = this.isExisting;
    try {
      await this.data.saveInvoice(this.inv);
      this.loadedInvoiceNo = this.inv.invoiceNo;
      await this.loadSavedInvoices();
      this.toast(wasExisting
        ? `Updated invoice ${this.inv.invoiceNo}.`
        : `Saved invoice ${this.inv.invoiceNo}.`, 'ok');
    } catch (e: any) {
      this.toast('Save failed: ' + (e?.message ?? 'check your connection.'), 'err');
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
    try {
      const url = this.pdf.previewUrl(this.inv);
      this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } catch (e: any) {
      this.toast('Preview failed: ' + (e?.message ?? 'unknown error.'), 'err');
    }
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
