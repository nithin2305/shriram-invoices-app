import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { StoredInvoice } from './data.service';

const HEADER_BLUE = 'FF1A2B49';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
};

@Injectable({ providedIn: 'root' })
export class MonthlyReportService {

  /** Build a monthly summary workbook: one row per invoice + totals row. */
  async generate(rows: StoredInvoice[], year: number, month: number): Promise<void> {
    const wb = new ExcelJS.Workbook();
    this.addInvoiceSheet(wb, `${year}-${String(month).padStart(2, '0')}`, rows);
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `Monthly_Report_${year}_${String(month).padStart(2, '0')}.xlsx`);
  }

  /**
   * Financial-year report (April fyStart – March fyStart+1):
   * sheet 1 = month-wise totals, sheet 2 = client-wise totals, sheet 3 = all invoices.
   */
  async generateFinancialYear(rows: StoredInvoice[], fyStart: number): Promise<void> {
    const wb = new ExcelJS.Workbook();

    // ---------- Sheet 1: month-wise ----------
    const wsM = wb.addWorksheet('Month-wise');
    wsM.columns = [
      { header: 'Month', key: 'month', width: 18 },
      { header: 'Invoices', key: 'count', width: 12 },
      { header: 'Amount', key: 'amt', width: 16 }
    ];
    this.styleHeader(wsM);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let grand = 0, grandCount = 0;
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1;                    // 4..12, 1..3
      const y = m >= 4 ? fyStart : fyStart + 1;
      const prefix = `${y}-${String(m).padStart(2, '0')}`;
      const inMonth = rows.filter(r => (r.isoDate ?? '').startsWith(prefix));
      const amt = inMonth.reduce((a, r) => a + (Number(r.total) || 0), 0);
      grand += amt; grandCount += inMonth.length;
      const row = wsM.addRow({ month: `${monthNames[m - 1]} ${y}`, count: inMonth.length, amt });
      row.getCell('amt').numFmt = '#,##0.00';
      row.eachCell(c => { c.border = THIN_BORDER; });
    }
    this.addTotalRow(wsM, { month: 'TOTAL', count: grandCount, amt: grand }, 'month');

    // ---------- Sheet 2: client-wise ----------
    const wsC = wb.addWorksheet('Client-wise');
    wsC.columns = [
      { header: 'Customer', key: 'cust', width: 42 },
      { header: 'GST No', key: 'gst', width: 20 },
      { header: 'Invoices', key: 'count', width: 12 },
      { header: 'Amount', key: 'amt', width: 16 }
    ];
    this.styleHeader(wsC);

    const byClient = new Map<string, { gst: string; count: number; amt: number }>();
    rows.forEach(r => {
      const key = (r.customer?.name ?? '').trim() || '(no name)';
      const e = byClient.get(key) ?? { gst: r.customer?.gstNo ?? '', count: 0, amt: 0 };
      e.count++; e.amt += Number(r.total) || 0;
      if (!e.gst && r.customer?.gstNo) { e.gst = r.customer.gstNo; }
      byClient.set(key, e);
    });
    [...byClient.entries()]
      .sort((a, b) => b[1].amt - a[1].amt)
      .forEach(([name, e]) => {
        const row = wsC.addRow({ cust: name, gst: e.gst, count: e.count, amt: e.amt });
        row.getCell('amt').numFmt = '#,##0.00';
        row.eachCell(c => { c.border = THIN_BORDER; });
      });
    this.addTotalRow(wsC, { cust: 'TOTAL', count: grandCount, amt: grand }, 'cust');

    // ---------- Sheet 3: every invoice ----------
    this.addInvoiceSheet(wb, 'All invoices', rows);

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `FY_Report_${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}.xlsx`);
  }

  /** One-row-per-invoice sheet (used by both the monthly and FY reports). */
  private addInvoiceSheet(wb: ExcelJS.Workbook, name: string, rows: StoredInvoice[]): void {
    const ws = wb.addWorksheet(name);

    ws.columns = [
      { header: 'Date',        key: 'date',     width: 13 },
      { header: 'Invoice No',  key: 'no',       width: 12 },
      { header: 'Customer',    key: 'cust',     width: 38 },
      { header: 'GST No',      key: 'gst',      width: 20 },
      { header: 'Vehicles',    key: 'veh',      width: 26 },
      { header: 'L.R. Count',  key: 'lrc',      width: 11 },
      { header: 'Charges',     key: 'chg',      width: 40 },
      { header: 'Amount',      key: 'amt',      width: 14 }
    ];
    this.styleHeader(ws);

    let grandTotal = 0;
    rows.forEach(r => {
      grandTotal += Number(r.total) || 0;
      const veh = (r.vehicles ?? []).map(v => `${v.vehicleNo} (${v.vehicleType})`).join(', ');
      const chg = (r.charges ?? []).map(c => `${c.label}: ${Number(c.amount).toFixed(2)}`).join('; ');
      const row = ws.addRow({
        date: r.dateDisplay,
        no: r.invoiceNo,
        cust: r.customer.name,
        gst: r.customer.gstNo,
        veh,
        lrc: (r.lrRows ?? []).length,
        chg,
        amt: Number(r.total) || 0
      });
      row.getCell('amt').numFmt = '#,##0.00';
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(c => { c.border = THIN_BORDER; });
    });

    // totals row
    const total = ws.addRow({ chg: 'TOTAL', amt: grandTotal });
    total.font = { bold: true };
    total.getCell('amt').numFmt = '#,##0.00';
    total.getCell('chg').alignment = { horizontal: 'right' };
    total.eachCell(c => {
      c.border = { top: { style: 'double' }, bottom: { style: 'thin' } };
    });
  }

  private styleHeader(ws: ExcelJS.Worksheet): void {
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle', horizontal: 'center' };
    head.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLUE } };
      c.border = THIN_BORDER;
    });
  }

  private addTotalRow(ws: ExcelJS.Worksheet, values: Record<string, unknown>, labelKey: string): void {
    const total = ws.addRow(values);
    total.font = { bold: true };
    total.getCell('amt').numFmt = '#,##0.00';
    total.getCell(labelKey).alignment = { horizontal: 'right' };
    total.eachCell(c => {
      c.border = { top: { style: 'double' }, bottom: { style: 'thin' } };
    });
  }
}
