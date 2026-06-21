import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { Invoice, LrRow, formatAmount, invoiceTotal } from './invoice.model';

@Injectable({ providedIn: 'root' })
export class PdfService {

  generate(inv: Invoice): void {
    const doc = this.build(inv);
    doc.save(`Invoice_${inv.invoiceNo}.pdf`);
  }

  previewUrl(inv: Invoice): string {
    return this.build(inv).output('bloburl').toString();
  }

  private build(inv: Invoice): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    if (inv.bothCopies) {
      this.drawPage(doc, inv, 'ORIGINAL COPY');
      doc.addPage();
      this.drawPage(doc, inv, 'DUPLICATE COPY');
    } else {
      this.drawPage(doc, inv, 'ORIGINAL COPY');
    }
    return doc;
  }

  private drawSignature(doc: jsPDF, cx: number, baseY: number, scale = 0.6): void {
    const s = scale;
    doc.setDrawColor(15, 35, 85);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    const rel = (x0: number, y0: number, segs: number[][], lw: number): void => { doc.setLineWidth(lw * s); doc.lines(segs, x0, y0, [1, 1], 'S', false); };

    const ax = cx - 26 * s, ay = baseY;
    rel(ax - 4 * s, ay + 1 * s, [[2 * s, -3 * s, 5 * s, -9 * s, 8 * s, -13 * s]], 0.6);
    rel(ax + 4 * s, ay - 13 * s, [[-1 * s, 5 * s, -2 * s, 9 * s, -3 * s, 13 * s]], 0.7);
    rel(ax + 4 * s, ay - 13 * s, [[2 * s, 5 * s, 3 * s, 9 * s, 5 * s, 13 * s]], 0.7);
    rel(ax + 1 * s, ay - 5 * s, [[2 * s, -0.8 * s, 5 * s, 0.4 * s, 7 * s, -0.4 * s]], 0.5);

    const bx = cx - 13 * s, by = baseY - 4 * s;
    rel(bx, by, [
      [2 * s, -2 * s, 4 * s, 3 * s, 6 * s, -1 * s],
      [1.5 * s, 3 * s, 3 * s, -5 * s, 5 * s, 1 * s],
      [2.5 * s, 2 * s, 5 * s, -4 * s, 7 * s, 0 * s],
      [2 * s, 2.5 * s, 4.5 * s, -5 * s, 7 * s, -0.5 * s],
      [2 * s, 2 * s, 5 * s, -4 * s, 8 * s, 0.5 * s],
      [2 * s, 1.5 * s, 5 * s, -3 * s, 9 * s, 0 * s]
    ], 0.55);

    doc.setLineWidth(0.7 * s);
    doc.lines([
      [-8 * s, 2.5 * s, -30 * s, 4 * s, -46 * s, -0.5 * s],
      [-3 * s, -2.5 * s, 2 * s, -2 * s, 6 * s, 1.5 * s]
    ], cx + 30 * s, baseY + 5 * s, [1, 1], 'S', false);

    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    doc.setLineCap('butt');
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
    const nameY = y + 10;
    doc.text(c.name, M + W / 2, nameY, { align: 'center' });
    const nameW = doc.getTextWidth(c.name);
    doc.setLineWidth(0.6);
    doc.line(M + W / 2 - nameW / 2, nameY + 1.4, M + W / 2 + nameW / 2, nameY + 1.4);
    doc.setLineWidth(0.4);

    // address
    doc.setFont('times', 'normal'); doc.setFontSize(13.5);
    doc.text(c.address, M + W / 2, nameY + 8, { align: 'center' });

    // contact / email
    doc.setFontSize(12);
    doc.text(`Contact No : ${c.contact}     E-Mail : ${c.email}`, M + W / 2, nameY + 14.5, { align: 'center' });

    // state / gstin / pan
    const stateY = nameY + 20.5;
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
    const titleTop = headerBottom;
    const titleH = 10;
    doc.rect(M, titleTop, W, titleH);
    doc.setFont('times', 'bold'); doc.setFontSize(16);
    const tY = titleTop + 6.8;
    doc.text('INVOICE', M + W / 2, tY, { align: 'center' });
    const tW = doc.getTextWidth('INVOICE');
    doc.setLineWidth(0.6);
    doc.line(M + W / 2 - tW / 2, tY + 1.3, M + W / 2 + tW / 2, tY + 1.3);
    doc.setLineWidth(0.4);

    // ---------- BILL-TO / INVOICE NO / DATE ----------
    const btTop = titleTop + titleH;
    const btH = 34;
    const splitX = M + 119;            // vertical divider
    doc.rect(M, btTop, W, btH);
    doc.line(splitX, btTop, splitX, btTop + btH);

    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    const custWidth = splitX - M - 6;     // text must stay left of the divider
    const custRaw: string[] = [inv.customer.name, inv.customer.addressLine1, inv.customer.addressLine2]
      .filter(t => t && String(t).trim());
    if (inv.customer.gstNo) { custRaw.push(`GST NO: ${inv.customer.gstNo}`); }
    const custLines: string[] = [];
    custRaw.forEach(t => { (doc.splitTextToSize(String(t), custWidth) as string[]).forEach(l => custLines.push(l)); });
    let custFont = 11.5;
    const topPad = 6.5, botPad = 3;
    let lh = (btH - topPad - botPad) / Math.max(1, custLines.length);
    if (lh > 7) { lh = 7; }
    if (lh < 4.4) { custFont = 10; lh = (btH - topPad - botPad) / Math.max(1, custLines.length); }
    if (lh < 3.8) { custFont = 9;  lh = (btH - topPad - botPad) / Math.max(1, custLines.length); }
    doc.setFontSize(custFont);
    let by = btTop + topPad;
    custLines.forEach(line => { doc.text(line, M + 3, by); by += lh; });

    // right side: invoice no box (top) and date box
    const invNoBoxH = 17;
    doc.line(splitX, btTop + invNoBoxH, R, btTop + invNoBoxH);
    doc.setFontSize(11.5);
    doc.text(`INVOICE  NO : ${inv.invoiceNo}`, splitX + 3, btTop + 7);
    doc.text(`DATE : ${inv.date}`, splitX + 3, btTop + invNoBoxH + 7);

    // ---------- MAIN TABLE ----------
    const thTop = btTop + btH;
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

    // body — height is whatever remains between the table header and the fixed footer,
    // so the footer + bottom line always land at the same place on the A4 page.
    const PAGE_H = 297;
    const fH = 80;                 // footer block height (fits the signature)
    const bottomLineGap = 6;       // space for E.&O.E line below footer
    const pageBottomMargin = 4;
    const fTop = PAGE_H - pageBottomMargin - bottomLineGap - fH;
    const totH = 9;
    const bodyTop = thTop + thH;
    const bodyBottom = fTop - totH;          // total row sits directly above footer
    const bodyH = bodyBottom - bodyTop;
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
    const vSplit1 = snoX + 50;          // label | vehicle-no divider
    const vSplit2 = snoX + 96;          // vehicle-no | vehicle-type divider
    doc.line(vSplit1, bodyTop, vSplit1, bodyTop + r1H);
    doc.line(vSplit2, bodyTop, vSplit2, bodyTop + r1H);
    doc.setFontSize(11.5);
    doc.text(String(inv.charges[0]?.label ?? ''), snoX + 3, bodyTop + 6);
    // draw text, auto-shrinking the font so it never crosses maxX
    const fitText = (txt: string, x2: number, y2: number, maxX: number, baseSize: number): void => {
      doc.setFontSize(baseSize);
      const maxW = maxX - x2;
      const w = doc.getTextWidth(txt);
      if (w > maxW) { doc.setFontSize(Math.max(6.5, baseSize * maxW / w)); }
      doc.text(txt, x2, y2);
      doc.setFontSize(baseSize);
    };
    inv.vehicles.forEach((v, i) => {
      const vy = bodyTop + 6 + i * 6;
      fitText(`Vehicle No: ${v.vehicleNo ?? ''}`, vSplit1 + 3, vy, vSplit2 - 1, 10);
      fitText(`VehicleType: ${v.vehicleType ?? ''}`, vSplit2 + 3, vy, amtX - 1, 10);
    });

    // first charge amount just below row 1
    doc.setFontSize(11.5);
    if (inv.charges[0]) {
      doc.text(formatAmount(Number(inv.charges[0].amount) || 0), R - 3, bodyTop + r1H + 5.5, { align: 'right' });
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

    // measure: lines per LR row at base font 10
    doc.setFont('times', 'bold'); doc.setFontSize(10);
    const pkgsStack = (v: unknown): string => String(v ?? '').trim().split(/\s+/).filter(Boolean).join('\n');
    const cellText = (row: LrRow, key: keyof LrRow): string => key === 'pkgs' ? pkgsStack(row[key]) : String(row[key] ?? '');
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

    const extras = inv.charges.slice(1).filter(ch => (ch.label && String(ch.label).trim()) || Number(ch.amount) !== 0);
    const lrHeaderH = 7;          // LR header line + gap
    const gstReserve = 8;         // space kept for GST note at body bottom
    const avail = bodyH - r1H - lrHeaderH - gstReserve - 2;

    // total number of text lines we must place (LR rows are multi-line via pkgs/wrap)
    const totalLRLines = rowLines.reduce((a, n) => a + n, 0);
    const nRows = inv.lrRows.length;
    const nExtra = extras.length;

    // Ideal (comfortable) metrics
    let lineH = 4.5;     // height of one text line within an LR row
    let rowGap = 4.5;    // gap between LR rows
    let chargeH = 7;     // height per extra charge line
    let lrFont = 10;

    // What we need at ideal metrics:
    const needed = () => totalLRLines * lineH + nRows * rowGap + nExtra * chargeH;

    // Compress until it fits the available slot.
    if (needed() > avail) {
      const k = avail / needed();
      lineH = Math.max(2.4, lineH * k);
      rowGap = Math.max(0.6, rowGap * k);
      chargeH = Math.max(3.4, chargeH * k);
      if (k < 0.85) { lrFont = 9; }
      if (k < 0.7)  { lrFont = 8; }
      if (k < 0.55) { lrFont = 7; }
      let guard = 0;
      while (needed() > avail && guard++ < 40) {
        lineH = Math.max(2.1, lineH * 0.96);
        rowGap = Math.max(0.3, rowGap * 0.9);
        chargeH = Math.max(3.0, chargeH * 0.94);
      }
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

    // additional charges — stacked directly below the LR rows, but never past the GST note
    if (extras.length) {
      const chFont = Math.min(10, Math.max(7, lrFont));
      const gstLineY = bodyBottom - 4;
      let cy = rowY + Math.max(1.5, rowGap);
      const stackH = extras.length * chargeH;
      if (cy + stackH > gstLineY - 3) {
        cy = gstLineY - 3 - stackH;
      }
      extras.forEach(ch => {
        doc.setFont('times', 'bold'); doc.setFontSize(chFont);
        const label = String(ch.label ?? '').toUpperCase();
        let w = doc.getTextWidth(label);
        const maxW = (amtX - 2) - (snoX + 3);
        if (w > maxW) {
          doc.setFontSize(Math.max(6.5, chFont * maxW / w));
          w = doc.getTextWidth(label);
        }
        if (snoX + 108 + w / 2 > amtX - 2) {
          doc.text(label, amtX - 2, cy, { align: 'right' });
        } else {
          doc.text(label, snoX + 108, cy, { align: 'center' });
        }
        doc.setFontSize(Math.min(11.5, chFont + 1.5));
        doc.text(formatAmount(Number(ch.amount)), R - 3, cy, { align: 'right' });
        cy += chargeH;
      });
    }

    // GST note at bottom of description box
    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    doc.text(inv.gstNote, snoX + 3, bodyBottom - 4);

    // ---------- TOTAL ROW ----------
    doc.rect(M, bodyBottom, W, totH);
    doc.line(snoX, bodyBottom, snoX, bodyBottom + totH);
    doc.line(amtX, bodyBottom, amtX, bodyBottom + totH);
    doc.setFont('times', 'bold'); doc.setFontSize(11.5);
    doc.text('TOTAL', amtX - 3, bodyBottom + 5.7, { align: 'right' });
    doc.text(invoiceTotal(inv).toFixed(2), R - 3, bodyBottom + 5.7, { align: 'right' });

    // ---------- FOOTER BLOCK ----------
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

    const sigCx = sigBoxX + (R - sigBoxX) / 2;
    doc.setFontSize(11.5);
    doc.text(`FOR ${c.name}`, sigCx, decY + 1, { align: 'center' });
    if (inv.digitalSignature && inv.signatoryName) {
      this.drawSignature(doc, sigCx, fBottom - 12, 0.6);
      doc.setFont('times', 'normal'); doc.setFontSize(6);
      doc.setTextColor(70, 70, 70);
      doc.text(`(Digitally signed by ${inv.signatoryName})`, sigCx, fBottom - 4.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
    doc.setFont('times', 'normal'); doc.setFontSize(10);
    doc.text('Authorised signature', sigCx, fBottom - 1, { align: 'center' });

    // ---------- BOTTOM LINE ----------
    doc.setFont('times', 'bold'); doc.setFontSize(11);
    doc.text('E. & O.E', M + 3, fBottom + 6);
    doc.text(`SUBJECT TO ${c.jurisdiction.toUpperCase()} JURISDICTION`, M + 78, fBottom + 6);
  }
}