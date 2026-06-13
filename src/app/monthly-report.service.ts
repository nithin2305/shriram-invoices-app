import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { StoredInvoice } from './data.service';

@Injectable({ providedIn: 'root' })
export class MonthlyReportService {

  /** Build a monthly summary workbook: one row per invoice + totals row. */
  async generate(rows: StoredInvoice[], year: number, month: number): Promise<void> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${year}-${String(month).padStart(2, '0')}`);

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

    // header styling
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle', horizontal: 'center' };
    head.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2B49' } };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

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
      row.eachCell(c => {
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    // totals row
    const total = ws.addRow({ chg: 'TOTAL', amt: grandTotal });
    total.font = { bold: true };
    total.getCell('amt').numFmt = '#,##0.00';
    total.getCell('chg').alignment = { horizontal: 'right' };
    total.eachCell(c => {
      c.border = { top: { style: 'double' }, bottom: { style: 'thin' } };
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `Monthly_Report_${year}_${String(month).padStart(2, '0')}.xlsx`);
  }
}