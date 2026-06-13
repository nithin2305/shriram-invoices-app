import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { Invoice, LrRow, formatAmount, invoiceTotal } from './invoice.model';

@Injectable({ providedIn: 'root' })
export class PdfService {

  /** Generates the two-page PDF (DUPLICATE COPY + ORIGINAL COPY) and triggers download. */
  generate(inv: Invoice): void {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    this.drawPage(doc, inv, 'DUPLICATE COPY');
    doc.addPage();
    this.drawPage(doc, inv, 'ORIGINAL COPY');
    doc.save(`Invoice_${inv.invoiceNo}.pdf`);
  }

  /** Returns a blob URL for live preview in an <iframe>. */
  previewUrl(inv: Invoice): string {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    this.drawPage(doc, inv, 'DUPLICATE COPY');
    doc.addPage();
    this.drawPage(doc, inv, 'ORIGINAL COPY');
    return doc.output('bloburl').toString();
  }

  private drawPage(doc: jsPDF, inv: Invoice, copyLabel: string): void {
    const M = 15;            // left margin
    const W = 180;           // content width
    const R = M + W;         // right edge = 192
    const c = inv.company;

    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);

    // ---------- HEADER BLOCK ----------
    let y = 12;
    const headerTop = y;

    // copy label (top right, inside border)
    doc.setFont('times', 'normal'); doc.setFontSize(11);
    doc.text(copyLabel, R - 4, y + 6, { align: 'right' });

    // company name - centered, bold, underlined
    doc.setFont('times', 'bold'); doc.setFontSize(20);
    const nameY = y + 12;
    doc.text(c.name, M + W / 2, nameY, { align: 'center' });
    const nameW = doc.getTextWidth(c.name);
    doc.setLineWidth(0.6);
    doc.line(M + W / 2 - nameW / 2, nameY + 1.4, M + W / 2 + nameW / 2, nameY + 1.4);
    doc.setLineWidth(0.4);

    // address
    doc.setFont('times', 'normal'); doc.setFontSize(13.5);
    doc.text(c.address, M + W / 2, nameY + 9, { align: 'center' });

    // contact / email
    doc.setFontSize(12);
    doc.text(`Contact No : ${c.contact}     E-Mail : ${c.email}`, M + W / 2, nameY + 16.5, { align: 'center' });

    // state / gstin / pan
    const stateY = nameY + 23.5;
    doc.setFontSize(12);
    const parts = [
      { label: 'State:', value: ` ${c.state}  ` },
      { label: 'GSTIN:', value: ` ${c.gstin}  ` },
      { label: 'PAN No:', value: ` ${c.pan}` }
    ];
    let totW = 0;
    parts.forEach(p => {
      doc.setFont('times', 'bold'); totW += doc.getTextWidth(p.label);
      doc.setFont('times', 'normal'); totW += doc.getTextWidth(p.value);
    });
    let x = M + W / 2 - totW / 2;
    parts.forEach(p => {
      doc.setFont('times', 'bold'); doc.text(p.label, x, stateY); x += doc.getTextWidth(p.label);
      doc.setFont('times', 'normal'); doc.text(p.value, x, stateY); x += doc.getTextWidth(p.value);
    });

    const headerBottom = stateY + 3;
    doc.rect(M, headerTop, W, headerBottom - headerTop);

    // ---------- INVOICE TITLE BAR ----------
    const titleTop = headerBottom + 4;
    const titleH = 12;
    doc.rect(M, titleTop, W, titleH);
    doc.setFont('times', 'bold'); doc.setFontSize(16);
    const tY = titleTop + 7.8;
    doc.text('INVOICE', M + W / 2, tY, { align: 'center' });
    const tW = doc.getTextWidth('INVOICE');
    doc.setLineWidth(0.6);
    doc.line(M + W / 2 - tW / 2, tY + 1.3, M + W / 2 + tW / 2, tY + 1.3);
    doc.setLineWidth(0.4);

    // ---------- BILL-TO / INVOICE NO / DATE ----------
    const btTop = titleTop + titleH + 4;
    const btH = 44;
    const splitX = M + 119;            // vertical divider
    doc.rect(M, btTop, W, btH);
    doc.line(splitX, btTop, splitX, btTop + btH);

    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    let by = btTop + 8;
    doc.text(inv.customer.name, M + 3, by); by += 9;
    if (inv.customer.addressLine1) { doc.text(inv.customer.addressLine1, M + 3, by); by += 9; }
    if (inv.customer.addressLine2) { doc.text(inv.customer.addressLine2, M + 3, by); by += 9; }
    doc.text(`GST NO: ${inv.customer.gstNo}`, M + 3, by);

    // right side: invoice no box (top) and date box
    const invNoBoxH = 20;
    doc.line(splitX, btTop + invNoBoxH, R, btTop + invNoBoxH);
    doc.setFontSize(11.5);
    doc.text(`INVOICE  NO : ${inv.invoiceNo}`, splitX + 3, btTop + 8);
    doc.text(`DATE : ${inv.date}`, splitX + 3, btTop + invNoBoxH + 8);

    // ---------- MAIN TABLE ----------
    const thTop = btTop + btH + 4;
    const thH = 9;
    const snoX = M + 14;               // S.NO column right edge
    const amtX = R - 28;               // Amount column left edge
    doc.rect(M, thTop, W, thH);
    doc.line(snoX, thTop, snoX, thTop + thH);
    doc.line(amtX, thTop, amtX, thTop + thH);
    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    doc.text('S.NO', M + (snoX - M) / 2, thTop + 5.4, { align: 'center' });
    doc.text('DESCRIPTION OF GOODS/SERVICES', snoX + (amtX - snoX) / 2, thTop + 5.4, { align: 'center' });
    doc.text('Amount', amtX + (R - amtX) / 2, thTop + 5.4, { align: 'center' });

    // body
    const bodyTop = thTop + thH;
    const bodyH = 76;
    const bodyBottom = bodyTop + bodyH;
    doc.rect(M, bodyTop, W, bodyH);
    doc.line(snoX, bodyTop, snoX, bodyBottom);
    doc.line(amtX, bodyTop, amtX, bodyBottom);

    // S.NO "1"
    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    doc.text('1', M + (snoX - M) / 2, bodyTop + 6.5, { align: 'center' });

    // row 1: first charge label | vehicle lines (one per vehicle)
    const nVeh = Math.max(1, inv.vehicles.length);
    const r1H = Math.max(9, 3.5 + nVeh * 6);
    doc.line(snoX, bodyTop + r1H, amtX, bodyTop + r1H);
    const vSplit1 = snoX + 56;
    const vSplit2 = snoX + 102;
    doc.line(vSplit1, bodyTop, vSplit1, bodyTop + r1H);
    doc.line(vSplit2, bodyTop, vSplit2, bodyTop + r1H);
    doc.setFontSize(11.5);
    doc.text(inv.charges[0] ? inv.charges[0].label : 'Transportation Charges', snoX + 3, bodyTop + 6);
    doc.setFontSize(10);
    inv.vehicles.forEach((v, i) => {
      const vy = bodyTop + 6 + i * 6;
      doc.text(`Vehicle No: ${v.vehicleNo}`, vSplit1 + 3, vy);
      doc.text(`VehicleType: ${v.vehicleType}`, vSplit2 + 3, vy);
    });

    // first charge amount just below row 1
    doc.setFontSize(11.5);
    if (inv.charges[0]) {
      doc.text(formatAmount(inv.charges[0].amount), R - 3, bodyTop + r1H + 5.5, { align: 'right' });
    }

    // ---- AUTO-FIT BODY: measure content, compress spacing to guarantee one A4 page ----
    const lrCols: { key: keyof LrRow; label: string; cx: number }[] = [
      { key: 'lrNo',        label: 'L.R. No',               cx: snoX + 14 },
      { key: 'date',        label: 'Date',                  cx: snoX + 35 },
      { key: 'from',        label: 'FROM',                  cx: snoX + 55 },
      { key: 'to',          label: 'To',                    cx: snoX + 80 },
      { key: 'description', label: 'Description of Goods',  cx: snoX + 108 },
      { key: 'pkgs',        label: 'Pkgs',                  cx: snoX + 130 }
    ];
    const colWOf = (k: keyof LrRow): number => k === 'description' ? 40 : (k === 'to' || k === 'from' ? 32 : 22);
const pkgsStack = (v: unknown): string => String(v ?? '').trim().split(/\s+/).filter(Boolean).join('\n');
const cellText = (row: LrRow, key: keyof LrRow): string => key === 'pkgs' ? pkgsStack(row[key]) : String(row[key] ?? '');
    // measure: lines per LR row at base font 10
    doc.setFont('times', 'bold'); doc.setFontSize(10);
    const rowLines = inv.lrRows.map(row => {
      let maxLines = 1;
      lrCols.forEach(col => {
        const raw = cellText(row, col.key);
        let n = 0;
        raw.split('\n').forEach(part => { n += (doc.splitTextToSize(part, colWOf(col.key)) as string[]).length; });
        maxLines = Math.max(maxLines, Math.max(1, n));
      });
      return maxLines;
    });

    const extras = inv.charges.slice(1).filter(ch => ch.label && Number(ch.amount) !== 0);
    const lrHeaderH = 8;          // LR header line + gap
    const gstReserve = 9;         // space kept for GST note at body bottom
    const avail = bodyH - r1H - lrHeaderH - gstReserve - 4;

    // base units
    let lineH = 4.5, rowGap = 4.5, chargeH = 7, lrFont = 10;
    const needed = rowLines.reduce((a, n) => a + n * lineH + rowGap, 0) + extras.length * chargeH + 4;
    if (needed > avail) {
      const k = Math.max(0.55, avail / needed);
      lineH *= k; rowGap *= k; chargeH = Math.max(4.5, chargeH * k);
      if (k < 0.85) { lrFont = 9; }
      if (k < 0.7)  { lrFont = 8.5; }
    }

    // LR sub-header (bold, underlined)
    const lrY = bodyTop + r1H + 6;
    doc.setFont('times', 'bold'); doc.setFontSize(10);
    lrCols.forEach(col => {
      doc.text(col.label, col.cx, lrY, { align: 'center' });
      const w = doc.getTextWidth(col.label);
      doc.line(col.cx - w / 2, lrY + 1, col.cx + w / 2, lrY + 1);
    });

    // LR data rows
    doc.setFont('times', 'bold'); doc.setFontSize(lrFont);
    let rowY = lrY + lrHeaderH;
    inv.lrRows.forEach((row, ri) => {
      lrCols.forEach(col => {
        const raw = cellText(row, col.key);
        const lines: string[] = [];
        raw.split('\n').forEach(part =>
          (doc.splitTextToSize(part, colWOf(col.key)) as string[]).forEach(l => lines.push(l)));
        lines.forEach((line, i) => doc.text(line, col.cx, rowY + i * lineH, { align: 'center' }));
      });
      rowY += rowLines[ri] * lineH + rowGap;
    });

    // additional charges stacked below LR rows
    if (extras.length) {
      let cy = rowY + 2;
      extras.forEach(ch => {
  doc.setFont('times', 'bold'); doc.setFontSize(10);
  const label = ch.label.toUpperCase();
  let w = doc.getTextWidth(label);
  const maxW = (amtX - 2) - (snoX + 3);
  if (w > maxW) {                                   // longer than the whole column: shrink font
    doc.setFontSize(Math.max(7.5, 10 * maxW / w));
    w = doc.getTextWidth(label);
  }
  if (snoX + 108 + w / 2 > amtX - 2) {
    doc.text(label, amtX - 2, cy, { align: 'right' }); // auto-shift left, end at column edge
  } else {
    doc.text(label, snoX + 108, cy, { align: 'center' });
  }
  doc.setFontSize(11.5);
  doc.text(formatAmount(Number(ch.amount)), R - 3, cy, { align: 'right' });
  cy += chargeH;
});
    }

    // GST note at bottom of description box
    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    doc.text(inv.gstNote, snoX + 3, bodyBottom - 4);

    // ---------- TOTAL ROW ----------
    const totH = 9;
      doc.rect(M, bodyBottom, W, totH);
    doc.line(snoX, bodyBottom, snoX, bodyBottom + totH);
    doc.line(amtX, bodyBottom, amtX, bodyBottom + totH);
    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    doc.text('TOTAL', amtX - 3, bodyBottom + 5.7, { align: 'right' });
    doc.text(invoiceTotal(inv).toFixed(2), R - 3, bodyBottom + 5.7, { align: 'right' });

    // ---------- FOOTER BLOCK ----------
    const fTop = bodyBottom + totH + 4;
    const fH = 70;
    const fBottom = fTop + fH;
    doc.rect(M, fTop, W, fH);

    doc.setFont('times', 'bold'); doc.setFontSize(11);
    doc.text('Amount Chargeable in Words :', M + 3, fTop + 7);
    doc.text(inv.amountInWords, M + 3, fTop + 14);

    // Company Bank Details - centered-ish heading, underlined
    const bankHeadY = fTop + 22;
    doc.setFontSize(11);
    const bh = 'Company Bank Details';
    const bhX = M + 128;
    doc.text(bh, bhX, bankHeadY, { align: 'center' });
    const bhW = doc.getTextWidth(bh);
    doc.line(bhX - bhW / 2, bankHeadY + 1, bhX + bhW / 2, bankHeadY + 1);

    // left: GST TO BE PAID BY CONSIGNOR / CONSIGNEE...
    doc.setFontSize(10.5);
    doc.text('GST TO BE PAID BY CONSIGNOR/', M + 3, bankHeadY + 6.5);
    doc.text('CONSIGNEE/GTA/OTHERS', M + 3, bankHeadY + 12.5);

    // bank rows
    const bankLabelX = M + 100, bankColonX = M + 130, bankValX = M + 134;
    const bankRows = [
      ['Bank Name', c.bankName],
      ['A/C. No', c.accountNo],
      ['Branch', c.branch],
      ['IFSC Code', c.ifsc]
    ];
    let bky = bankHeadY + 6.5;
    doc.setFontSize(10.5);
    bankRows.forEach(rw => {
      doc.text(rw[0], bankLabelX, bky);
      doc.text(':', bankColonX, bky);
      doc.text(rw[1], bankValX, bky);
      bky += 5.8;
    });

    // Declaration / signature section
    const decY = bky + 3;
    const sigBoxX = M + 98;
    doc.line(sigBoxX, decY - 4.5, R, decY - 4.5);          // top of signature box
    doc.line(sigBoxX, decY - 4.5, sigBoxX, fBottom);        // left of signature box

    doc.setFontSize(11);
    doc.text('Declaration', M + 3, decY);
    const dW = doc.getTextWidth('Declaration');
    doc.line(M + 3, decY + 1, M + 3 + dW, decY + 1);

    doc.setFontSize(10.5);
    doc.text('The goods were dispatched as per above details.', M + 3, decY + 6);
    doc.text('Kindly payment & oblige.', M + 3, decY + 12);

    doc.setFontSize(11.5);
    doc.text(`FOR ${c.name}`, sigBoxX + (R - sigBoxX) / 2, decY + 1, { align: 'center' });
    doc.setFont('times', 'normal'); doc.setFontSize(10.5);
    doc.text('Authorised signature', sigBoxX + (R - sigBoxX) / 2, fBottom - 2.5, { align: 'center' });

    // ---------- BOTTOM LINE ----------
    doc.setFont('times', 'bold'); doc.setFontSize(11);
    doc.text('E. & O.E', M + 3, fBottom + 6);
    doc.text(`SUBJECT TO ${c.jurisdiction.toUpperCase()} JURISDICTION`, M + 78, fBottom + 6);
  }
}
