import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Invoice, formatAmount, invoiceTotal } from './invoice.model';

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' },
  bottom: { style: 'thin' }, right: { style: 'thin' }
};

@Injectable({ providedIn: 'root' })
export class ExcelService {

  async generate(inv: Invoice): Promise<void> {
  const wb = new ExcelJS.Workbook();
    this.buildSheet(wb.addWorksheet('ORIGINAL COPY'), inv, 'ORIGINAL COPY');
    if (inv.bothCopies) {
      this.buildSheet(wb.addWorksheet('DUPLICATE COPY'), inv, 'DUPLICATE COPY');
    }
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `Invoice_${inv.invoiceNo}.xlsx`);
  }

  private buildSheet(ws: ExcelJS.Worksheet, inv: Invoice, copyLabel: string): void {
    const c = inv.company;
    // Columns A..H
    ws.columns = [
      { width: 7 },   // A S.NO
      { width: 12 },  // B L.R. No
      { width: 13 },  // C Date
      { width: 13 },  // D FROM
      { width: 15 },  // E To
      { width: 24 },  // F Description of Goods
      { width: 16 },  // G Pkgs / VehicleType
      { width: 14 }   // H Amount
    ];
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };

    const bold = (size: number): Partial<ExcelJS.Font> => ({ name: 'Times New Roman', bold: true, size });
    const norm = (size: number): Partial<ExcelJS.Font> => ({ name: 'Times New Roman', size });
    const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
    const left: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle' };
    const right: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };

    const set = (ref: string, value: ExcelJS.CellValue, font: Partial<ExcelJS.Font>,
                 align: Partial<ExcelJS.Alignment>, merge?: string): void => {
      if (merge) { ws.mergeCells(merge); }
      const cell = ws.getCell(ref);
      cell.value = value;
      cell.font = font;
      cell.alignment = align;
    };

    // ---- HEADER BLOCK (rows 1-5) ----
    set('A1', copyLabel, norm(11), right, 'A1:H1');
    set('A2', c.name, { ...bold(20), underline: true }, center, 'A2:H2');
    set('A3', c.address, norm(14), center, 'A3:H3');
    set('A4', `Contact No : ${c.contact}     E-Mail : ${c.email}`, norm(12), center, 'A4:H4');
    set('A5', `State: ${c.state}  GSTIN: ${c.gstin}  PAN No: ${c.pan}`, norm(12), center, 'A5:H5');
    ws.getRow(2).height = 26;
    this.boxBorder(ws, 1, 5, 1, 8);

    // ---- INVOICE TITLE (row 6) ----
    set('A6', 'INVOICE', { ...bold(16), underline: true }, center, 'A6:H6');
    ws.getRow(6).height = 22;
    this.boxBorder(ws, 6, 6, 1, 8);

    // ---- BILL-TO / INVOICE NO / DATE (rows 7-10) ----
    set('A7', inv.customer.name, bold(11), left, 'A7:F7');
    set('A8', inv.customer.addressLine1, bold(11), left, 'A8:F8');
    set('A9', inv.customer.addressLine2, bold(11), left, 'A9:F9');
    set('A10', `GST NO: ${inv.customer.gstNo}`, bold(11), left, 'A10:F10');
    set('G7', `INVOICE NO : ${inv.invoiceNo}`, bold(11), left, 'G7:H8');
    set('G9', `DATE : ${inv.date}`, bold(11), left, 'G9:H10');
    this.boxBorder(ws, 7, 10, 1, 6);
    this.boxBorder(ws, 7, 8, 7, 8);
    this.boxBorder(ws, 9, 10, 7, 8);

    // ---- TABLE HEADER (row 11) ----
    set('A11', 'S.NO', bold(11), center);
    set('B11', 'DESCRIPTION OF GOODS/SERVICES', bold(11), center, 'B11:G11');
    set('H11', 'Amount', bold(12), center);
    this.rangeBorder(ws, 11, 11, 1, 8);

    // ---- ROW 12+: first charge / vehicles (one row per vehicle) ----
    const vehicles = inv.vehicles.length ? inv.vehicles : [{ vehicleNo: '', vehicleType: '' }];
    const vehEnd = 12 + vehicles.length - 1;
    set('A12', 1, bold(12), center);
    if (vehicles.length > 1) { ws.mergeCells(`A12:A${vehEnd}`); }
    set('B12', inv.charges[0]?.label ?? 'Transportation Charges', bold(11), left, 'B12:D12');
    if (vehicles.length > 1) { ws.mergeCells(`B13:D${vehEnd}`); }
    vehicles.forEach((v, i) => {
      const r = 12 + i;
      set(`E${r}`, `Vehicle No: ${v.vehicleNo}`, bold(10), left, `E${r}:F${r}`);
      set(`G${r}`, `VehicleType: ${v.vehicleType}`, bold(10), left);
    });
    set('H12', formatAmount(Number(inv.charges[0]?.amount) || 0), bold(11), right);
    if (vehicles.length > 1) { ws.mergeCells(`H13:H${vehEnd}`); }
    this.rangeBorder(ws, 12, vehEnd, 1, 8);

    // ---- LR HEADER ----
    const lrHeadRow = vehEnd + 1;
    const lrHead = ['', 'L.R. No', 'Date', 'FROM', 'To', 'Description of Goods', 'Pkgs', ''];
    lrHead.forEach((h, i) => {
      if (h) { set(`${String.fromCharCode(65 + i)}${lrHeadRow}`, h, { ...bold(10), underline: true }, center); }
    });

    // ---- LR ROWS ----
    let r = lrHeadRow + 1;
    inv.lrRows.forEach(row => {
      set(`B${r}`, row.lrNo, bold(10), center);
      set(`C${r}`, row.date, bold(10), center);
      set(`D${r}`, row.from, bold(10), center);
      set(`E${r}`, row.to, bold(10), { ...center, wrapText: true });
      set(`F${r}`, row.description, bold(10), { ...center, wrapText: true });
      set(`G${r}`, String(row.pkgs ?? '').trim().split(/\s+/).filter(Boolean).join('\n'), bold(10), { ...center, wrapText: true });
      r++;
    });

    // ---- ADDITIONAL CHARGES (charges[1..]) ----
    let chargeRow = Math.max(r + 1, lrHeadRow + 4);
    const extras = inv.charges.slice(1).filter(ch => ch.label && Number(ch.amount) !== 0);
    extras.forEach(ch => {
      set(`E${chargeRow}`, ch.label.toUpperCase(), bold(10), center, `E${chargeRow}:F${chargeRow}`);
      set(`H${chargeRow}`, formatAmount(Number(ch.amount)), bold(11), right);
      chargeRow++;
    });

    const gstNoteRow = chargeRow + 1;
    set(`B${gstNoteRow}`, inv.gstNote, bold(11), left, `B${gstNoteRow}:G${gstNoteRow}`);

    // body borders: outer box + S.NO and Amount column separators
    this.boxBorder(ws, lrHeadRow, gstNoteRow, 1, 8);
    for (let i = lrHeadRow; i <= gstNoteRow; i++) {
      ws.getCell(`A${i}`).border = { ...ws.getCell(`A${i}`).border, right: { style: 'thin' } };
      ws.getCell(`G${i}`).border = { ...ws.getCell(`G${i}`).border, right: { style: 'thin' } };
    }

    // ---- TOTAL ROW ----
    const totalRow = gstNoteRow + 1;
    set(`B${totalRow}`, 'TOTAL', bold(11), right, `B${totalRow}:G${totalRow}`);
    set(`H${totalRow}`, invoiceTotal(inv).toFixed(2), bold(12), right);
    this.rangeBorder(ws, totalRow, totalRow, 1, 8);

    // ---- FOOTER BLOCK ----
    let f = totalRow + 1;
    const fStart = f;
    set(`A${f}`, 'Amount Chargeable in Words :', bold(11), left, `A${f}:H${f}`); f++;
    set(`A${f}`, inv.amountInWords, bold(11), left, `A${f}:H${f}`); f++;
    f++; // blank
    set(`D${f}`, 'Company Bank Details', { ...bold(11), underline: true }, center, `D${f}:G${f}`); f++;
    const bankStart = f;
    set(`A${f}`, 'GST TO BE PAID BY CONSIGNOR/', bold(10), left, `A${f}:C${f}`);
    set(`E${f}`, 'Bank Name', bold(10), left); set(`F${f}`, `:  ${c.bankName}`, bold(10), left, `F${f}:H${f}`); f++;
    set(`A${f}`, 'CONSIGNEE/GTA/OTHERS', bold(10), left, `A${f}:C${f}`);
    set(`E${f}`, 'A/C. No', bold(10), left); set(`F${f}`, `:  ${c.accountNo}`, bold(10), left, `F${f}:H${f}`); f++;
    set(`E${f}`, 'Branch', bold(10), left); set(`F${f}`, `:  ${c.branch}`, bold(10), left, `F${f}:H${f}`); f++;
    set(`E${f}`, 'IFSC Code', bold(10), left); set(`F${f}`, `:  ${c.ifsc}`, bold(10), left, `F${f}:H${f}`); f++;
    void bankStart;

    const decRow = f;
    set(`A${f}`, 'Declaration', { ...bold(11), underline: true }, left, `A${f}:D${f}`);
    set(`E${f}`, `FOR ${c.name}`, bold(12), center, `E${f}:H${f}`); f++;
    set(`A${f}`, 'The goods were dispatched as per above details.', bold(10), left, `A${f}:D${f}`); f++;
    set(`A${f}`, 'Kindly payment & oblige.', bold(10), left, `A${f}:D${f}`); f++;
   if (inv.digitalSignature && inv.signatoryName) {
      set(`E${f}`, inv.signatoryName, { name: 'Segoe Script', italic: true, bold: true, size: 18, color: { argb: 'FF0F2355' } }, center, `E${f}:H${f}`);
      ws.getRow(f).height = 26; f++;
      set(`E${f}`, `(Digitally signed by ${inv.signatoryName})`, { ...norm(8), color: { argb: 'FF464646' } }, center, `E${f}:H${f}`); f++;
    }
    set(`E${f}`, 'Authorised signature', norm(11), center, `E${f}:H${f}`);
    const fEnd = f;

    this.boxBorder(ws, fStart, fEnd, 1, 8);
    this.boxBorder(ws, decRow, fEnd, 5, 8); // signature box

    // ---- BOTTOM LINE ----
    f++;
    set(`A${f}`, 'E. & O.E', bold(11), left, `A${f}:B${f}`);
    set(`C${f}`, `SUBJECT TO ${c.jurisdiction.toUpperCase()} JURISDICTION`, bold(11), center, `C${f}:G${f}`);
  }

  /** Outline border around a rectangular range. */
  private boxBorder(ws: ExcelJS.Worksheet, r1: number, r2: number, c1: number, c2: number): void {
    for (let r = r1; r <= r2; r++) {
      for (let cl = c1; cl <= c2; cl++) {
        const cell = ws.getCell(r, cl);
        const b: Partial<ExcelJS.Borders> = { ...cell.border };
        if (r === r1) { b.top = { style: 'thin' }; }
        if (r === r2) { b.bottom = { style: 'thin' }; }
        if (cl === c1) { b.left = { style: 'thin' }; }
        if (cl === c2) { b.right = { style: 'thin' }; }
        cell.border = b;
      }
    }
  }

  /** Full grid border on a range. */
  private rangeBorder(ws: ExcelJS.Worksheet, r1: number, r2: number, c1: number, c2: number): void {
    for (let r = r1; r <= r2; r++) {
      for (let cl = c1; cl <= c2; cl++) {
        ws.getCell(r, cl).border = THIN;
      }
    }
  }
}