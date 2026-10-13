const { PDFDocument, resolveLogo, COLORS } = require('./pdf');

/**
 * Printable purchase order form / invoice, laid out in ruled columns:
 *
 *   [ library letterhead            |  DOCUMENT TITLE + reference table ]
 *   [ Supplier  |  Bill to  |  Order details ]
 *   [ # | Title & authors | ISBN | Qty | Rcvd | Unit price | Amount ]
 *   [ Notes / Payment               |  Totals ]
 *   [ Prepared by | Approved by | Received by ]
 *
 * Everything flows top to bottom with fixed gaps, so the page has no stretches
 * of empty space; a long order continues on the next page with the table
 * heading repeated.
 */

const M = 40; // page margin
const GAP = 10; // space between columns and between blocks
const FOOTER = 24; // reserved for the footer line at the bottom of every page

const C = {
  primary: COLORS.primary,
  text: '#111827',
  body: '#374151',
  muted: '#6B7280',
  rule: '#CBD5E1',
  strip: '#EEF2F7',
  zebra: '#F8FAFC',
  green: '#047857',
  red: '#B91C1C',
};

const R = 'Helvetica';
const B = 'Helvetica-Bold';

const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '-');
const humanize = (value) => (value ? String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '-');

function renderOrderDocument(res, {
  order, institution = {}, currencySymbol = '', generatedBy = '', inline = false,
}) {
  const money = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isDraft = order.status === 'draft';
  const isCancelled = order.status === 'cancelled';
  const isPaid = order.paymentStatus === 'paid';
  const title = isDraft ? 'PURCHASE ORDER' : 'INVOICE';
  const reference = order.invoiceNumber || order.orderCode;

  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: { Title: `${title} ${reference}`, Author: institution.universityName || 'ULMS' },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${isDraft ? 'order' : 'invoice'}-${reference}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - M * 2;
  const bottom = () => doc.page.height - M - FOOTER;
  let y = M;

  /** Starts a new page when `height` does not fit below `y`. */
  const ensure = (height) => {
    if (y + height > bottom()) {
      doc.addPage();
      y = M;
    }
  };

  const textHeight = (text, width, font = R, size = 8.5) => doc.font(font).fontSize(size).heightOfString(String(text), { width });

  /** A box with a shaded heading strip; `drawBody` renders inside and returns its bottom. */
  const strip = (x, top, width, heading) => {
    doc.rect(x, top, width, 16).fill(C.strip);
    doc.font(B).fontSize(7.5).fillColor(C.primary).text(heading.toUpperCase(), x + 6, top + 5, { width: width - 12, characterSpacing: 0.4 });
    return top + 16;
  };

  // ------------------------------------------------------------ letterhead
  {
    const rightW = 210;
    const leftW = W - rightW - GAP;
    let textX = M;
    const logo = resolveLogo(institution.logoUrl);
    if (logo) {
      try {
        doc.image(logo, M, y, { fit: [44, 44] });
        textX = M + 52;
      } catch {
        // A corrupt logo must never break a document.
      }
    }
    const lw = leftW - (textX - M);
    doc.font(B).fontSize(13).fillColor(C.primary).text(institution.universityName || 'University', textX, y, { width: lw });
    doc.font(B).fontSize(9).fillColor(C.text).text(institution.libraryName || 'University Library', textX, doc.y + 1, { width: lw });
    doc.font(R).fontSize(8).fillColor(C.muted);
    [institution.address, [institution.email, institution.phone].filter(Boolean).join('  ·  '), institution.website]
      .filter(Boolean).forEach((line) => doc.text(line, textX, doc.y + 1, { width: lw }));
    const leftBottom = Math.max(doc.y, logo ? y + 44 : 0);

    // Title and a small two-column reference table on the right.
    const rx = M + W - rightW;
    doc.font(B).fontSize(18).fillColor(C.primary).text(title, rx, y - 2, { width: rightW, align: 'right' });
    let ry = y + 24;
    const refs = [
      order.invoiceNumber ? ['Invoice no.', order.invoiceNumber] : null,
      ['Order no.', order.orderCode],
      ['Date', day(order.orderedAt || order.createdAt)],
    ].filter(Boolean);
    refs.forEach(([label, value]) => {
      doc.rect(rx, ry, rightW, 15).lineWidth(0.5).strokeColor(C.rule).stroke();
      doc.rect(rx, ry, 70, 15).fill(C.strip);
      doc.font(R).fontSize(8).fillColor(C.muted).text(label, rx + 5, ry + 4, { width: 62 });
      doc.font(B).fontSize(8).fillColor(C.text).text(value, rx + 75, ry + 4, { width: rightW - 80, align: 'right' });
      ry += 15;
    });

    // Status badge: what the reader most needs to know about this copy.
    const badge = isCancelled ? ['CANCELLED', C.red] : isPaid ? ['PAID', C.green] : isDraft ? ['DRAFT', C.muted] : ['PAYMENT DUE', C.red];
    doc.font(B).fontSize(8);
    const bw = doc.widthOfString(badge[0]) + 14;
    doc.roundedRect(rx + rightW - bw, ry + 5, bw, 16, 3).lineWidth(1).strokeColor(badge[1]).stroke();
    doc.fillColor(badge[1]).text(badge[0], rx + rightW - bw, ry + 9.5, { width: bw, align: 'center' });
    ry += 21;

    y = Math.max(leftBottom, ry) + 8;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1.5).strokeColor(C.primary).stroke();
    y += GAP;
  }

  // ---------------------------------------------- three information columns
  {
    const colW = (W - GAP * 2) / 3;
    const copies = order.items.reduce((s, i) => s + i.quantity, 0);
    const received = order.items.reduce((s, i) => s + (i.receivedQuantity || 0), 0);
    const columns = [
      {
        heading: 'Supplier',
        lines: [[order.supplier, true], [order.supplierAddress], [order.supplierContact]],
      },
      {
        heading: isDraft ? 'Order from' : 'Bill to',
        lines: [[institution.libraryName || 'University Library', true], [institution.universityName], [institution.address], [institution.email], [institution.phone]],
      },
      {
        heading: 'Order details',
        pairs: [
          ['Status', humanize(order.status)],
          ['Expected', day(order.expectedDate)],
          ['Books', `${order.items.length} title(s), ${copies} copies`],
          ['Received', `${received} of ${copies}`],
          ['Payment', isDraft || isCancelled ? '-' : humanize(order.paymentStatus)],
        ],
      },
    ];

    // Measure first so all three boxes share one height.
    const innerW = colW - 12;
    const bodyHeight = (col) => {
      if (col.pairs) return col.pairs.length * 12;
      return col.lines.filter(([t]) => t).reduce((h, [t, bold]) => h + textHeight(t, innerW, bold ? B : R, bold ? 9 : 8.5) + 1.5, 0);
    };
    const boxH = 16 + Math.max(...columns.map(bodyHeight)) + 10;
    ensure(boxH);

    columns.forEach((col, i) => {
      const x = M + i * (colW + GAP);
      let by = strip(x, y, colW, col.heading) + 5;
      if (col.pairs) {
        col.pairs.forEach(([label, value]) => {
          doc.font(R).fontSize(8).fillColor(C.muted).text(label, x + 6, by, { width: 50 });
          doc.font(B).fontSize(8).fillColor(C.text).text(value, x + 58, by, { width: colW - 64, align: 'right' });
          by += 12;
        });
      } else {
        col.lines.filter(([t]) => t).forEach(([t, bold]) => {
          doc.font(bold ? B : R).fontSize(bold ? 9 : 8.5).fillColor(bold ? C.text : C.body).text(t, x + 6, by, { width: innerW });
          by = doc.y + 1.5;
        });
      }
      doc.rect(x, y, colW, boxH).lineWidth(0.5).strokeColor(C.rule).stroke();
    });
    y += boxH + GAP + 2;
  }

  // ------------------------------------------------------------ items table
  {
    const cols = [
      { header: '#', w: 22, align: 'center' },
      { header: 'Title and author(s)', w: 0 },
      { header: 'ISBN', w: 78 },
      { header: 'Qty', w: 34, align: 'right' },
      { header: 'Rcvd', w: 34, align: 'right' },
      { header: 'Unit price', w: 66, align: 'right' },
      { header: 'Amount', w: 74, align: 'right' },
    ];
    cols[1].w = W - cols.reduce((s, c) => s + c.w, 0);
    const PAD = 5;

    const header = () => {
      doc.rect(M, y, W, 18).fill(C.primary);
      let x = M;
      cols.forEach((c) => {
        doc.font(B).fontSize(8).fillColor('#FFFFFF').text(c.header, x + PAD, y + 5.5, { width: c.w - PAD * 2, align: c.align || 'left' });
        x += c.w;
      });
      y += 18;
    };

    ensure(18 + 22);
    header();

    order.items.forEach((item, index) => {
      const titleW = cols[1].w - PAD * 2;
      const authorsH = item.authors ? textHeight(item.authors, titleW, R, 7.5) + 1 : 0;
      const rowH = Math.max(20, textHeight(item.title, titleW, B, 8.5) + authorsH + PAD * 2);
      if (y + rowH > bottom()) {
        doc.addPage();
        y = M;
        header();
      }

      if (index % 2 === 1) doc.rect(M, y, W, rowH).fill(C.zebra);
      const cells = [
        String(index + 1),
        null, // title cell is drawn separately (two styles)
        item.isbn || '-',
        String(item.quantity),
        String(item.receivedQuantity || 0),
        money(item.unitPrice),
        money(item.quantity * (item.unitPrice || 0)),
      ];
      let x = M;
      cols.forEach((c, i) => {
        if (i === 1) {
          doc.font(B).fontSize(8.5).fillColor(C.text).text(item.title, x + PAD, y + PAD, { width: titleW });
          if (item.authors) doc.font(R).fontSize(7.5).fillColor(C.muted).text(item.authors, x + PAD, doc.y + 1, { width: titleW });
        } else {
          doc.font(i === 6 ? B : R).fontSize(8.5).fillColor(C.text)
            .text(cells[i], x + PAD, y + PAD, { width: c.w - PAD * 2, align: c.align || 'left' });
        }
        doc.rect(x, y, c.w, rowH).lineWidth(0.5).strokeColor(C.rule).stroke();
        x += c.w;
      });
      y += rowH;
    });
    y += GAP;
  }

  // ---------------------------------------- notes / payment  |  totals
  {
    const rightW = 210;
    const leftW = W - rightW - GAP;
    const totals = [
      ['Subtotal', money(order.subtotal)],
      order.discount ? ['Discount', `- ${money(order.discount)}`] : null,
      order.taxRate ? [`Tax (${order.taxRate}%)`, money(order.taxAmount)] : null,
      order.shippingCost ? ['Shipping', money(order.shippingCost)] : null,
    ].filter(Boolean);
    const totalsH = totals.length * 16 + 22;

    const leftBoxes = [];
    if (!isDraft && !isCancelled) {
      leftBoxes.push({
        heading: isPaid ? 'Payment received' : 'Payment',
        pairs: isPaid
          ? [
            ['Date', day(order.paidAt)],
            ['Method', humanize(order.paymentMethod)],
            order.paymentReference ? ['Reference', order.paymentReference] : null,
            order.paidBy ? ['Recorded by', `${order.paidBy.firstName} ${order.paidBy.lastName}`] : null,
          ].filter(Boolean)
          : [['Status', 'Unpaid'], ['Amount due', money(order.totalAmount)]],
      });
    }
    if (isCancelled) {
      leftBoxes.push({ heading: 'Cancelled', text: `${day(order.cancelledAt)}${order.cancelReason ? `: ${order.cancelReason}` : ''}` });
    }
    if (order.notes) leftBoxes.push({ heading: 'Notes', text: order.notes });

    const boxHeight = (box) => 16 + (box.pairs ? box.pairs.length * 12 : textHeight(box.text, leftW - 12)) + 10;
    const leftH = leftBoxes.reduce((h, b) => h + boxHeight(b) + GAP, 0) - (leftBoxes.length ? GAP : 0);
    ensure(Math.max(totalsH, Math.min(leftH, 200)));
    const top = y;

    // Totals: ruled two-column table, grand total on a solid band.
    const tx = M + leftW + GAP;
    let ty = top;
    totals.forEach(([label, value]) => {
      doc.rect(tx, ty, rightW, 16).lineWidth(0.5).strokeColor(C.rule).stroke();
      doc.font(R).fontSize(8.5).fillColor(C.body).text(label, tx + 6, ty + 4.5, { width: 100 });
      doc.font(R).fontSize(8.5).fillColor(C.text).text(value, tx + 100, ty + 4.5, { width: rightW - 106, align: 'right' });
      ty += 16;
    });
    doc.rect(tx, ty, rightW, 22).fill(C.primary);
    doc.font(B).fontSize(10).fillColor('#FFFFFF')
      .text(isPaid ? 'TOTAL PAID' : 'TOTAL DUE', tx + 6, ty + 6.5, { width: 100 })
      .text(money(order.totalAmount), tx + 100, ty + 6.5, { width: rightW - 106, align: 'right' });
    ty += 22;

    // Left column boxes.
    let ly = top;
    leftBoxes.forEach((box) => {
      const h = boxHeight(box);
      if (ly + h > bottom()) {
        doc.addPage();
        ly = M;
        ty = M;
      }
      let by = strip(M, ly, leftW, box.heading) + 5;
      if (box.pairs) {
        box.pairs.forEach(([label, value]) => {
          doc.font(R).fontSize(8).fillColor(C.muted).text(label, M + 6, by, { width: 80 });
          doc.font(B).fontSize(8).fillColor(C.text).text(value, M + 90, by, { width: leftW - 96 });
          by += 12;
        });
      } else {
        doc.font(R).fontSize(8.5).fillColor(C.body).text(box.text, M + 6, by, { width: leftW - 12 });
      }
      doc.rect(M, ly, leftW, h).lineWidth(0.5).strokeColor(C.rule).stroke();
      ly += h + GAP;
    });

    y = Math.max(ty, ly - (leftBoxes.length ? GAP : 0)) + GAP + 4;
  }

  // ------------------------------------------------------ signature columns
  {
    const colW = (W - GAP * 2) / 3;
    const boxH = 16 + 3 * 18 + 4;
    ensure(boxH);
    const labels = isDraft
      ? ['Prepared by', 'Approved by', 'Supplier acknowledgement']
      : ['Prepared by', 'Approved by', 'Goods received by'];
    labels.forEach((label, i) => {
      const x = M + i * (colW + GAP);
      let by = strip(x, y, colW, label) + 6;
      ['Name', 'Signature', 'Date'].forEach((field) => {
        doc.font(R).fontSize(7.5).fillColor(C.muted).text(field, x + 6, by + 5, { width: 46 });
        doc.moveTo(x + 52, by + 13).lineTo(x + colW - 6, by + 13).lineWidth(0.5).strokeColor(C.rule).stroke();
        by += 18;
      });
      doc.rect(x, y, colW, boxH).lineWidth(0.5).strokeColor(C.rule).stroke();
    });
    y += boxH;
  }

  // ------------------------------------------------------- footer, all pages
  const range = doc.bufferedPageRange();
  const stamp = `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${generatedBy ? ` by ${generatedBy}` : ''}`;
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    const { bottom: marginBottom } = doc.page.margins;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - M - 10;
    doc.moveTo(M, fy - 4).lineTo(M + W, fy - 4).lineWidth(0.5).strokeColor(C.rule).stroke();
    doc.font(R).fontSize(7).fillColor(C.muted)
      .text(`${title} ${reference}  ·  ${stamp}`, M, fy, { width: W * 0.75, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, M, fy, { width: W, align: 'right', lineBreak: false });
    doc.page.margins.bottom = marginBottom;
  }

  doc.end();
}

module.exports = { renderOrderDocument };
