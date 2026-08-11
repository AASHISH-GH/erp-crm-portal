import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';

type ChallanWithItems = Prisma.ChallanGetPayload<{ include: { items: true } }>;

const INR = (value: Prisma.Decimal | number) =>
  `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Streams the challan as a PDF invoice straight to the response — nothing is written
 * to disk, which keeps the API stateless and safe to run on ephemeral hosting.
 *
 * Everything printed comes from the challan's own snapshot columns, never from a live
 * join to products/customers, so reprinting an old document reproduces it exactly.
 */
export const streamChallanPdf = (challan: ChallanWithItems, res: Response) => {
  const doc = new PDFDocument({ size: 'A4', margin: 44 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${challan.challanNumber}.pdf"`,
  );
  doc.pipe(res);

  const pageWidth = doc.page.width - 88;

  // ---- Header -------------------------------------------------------------
  doc.fontSize(20).font('Helvetica-Bold').text('SHREE DISTRIBUTORS', { align: 'left' });
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#555555')
    .text('Wholesale & Distribution | GSTIN: 27AAPFU0939F1ZV')
    .text('Plot 14, MIDC Industrial Area, Pune 411019 | +91 98765 43210');

  doc.moveDown(0.8);
  doc
    .fillColor('#111111')
    .fontSize(15)
    .font('Helvetica-Bold')
    .text('DELIVERY CHALLAN', { align: 'right' });

  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#555555')
    .text(`No: ${challan.challanNumber}`, { align: 'right' })
    .text(`Date: ${formatDate(challan.createdAt)}`, { align: 'right' })
    .text(`Status: ${challan.status}`, { align: 'right' });

  doc.moveDown(0.5);
  doc.moveTo(44, doc.y).lineTo(doc.page.width - 44, doc.y).strokeColor('#dddddd').stroke();
  doc.moveDown(0.8);

  // ---- Bill to ------------------------------------------------------------
  doc.fillColor('#111111').fontSize(10).font('Helvetica-Bold').text('BILL TO');
  doc.font('Helvetica').fillColor('#333333');
  doc.text(challan.customerBusinessName || challan.customerName);
  if (challan.customerBusinessName) doc.text(`Attn: ${challan.customerName}`);
  if (challan.customerAddress) doc.text(challan.customerAddress, { width: 280 });
  if (challan.customerMobile) doc.text(`Mobile: ${challan.customerMobile}`);
  if (challan.customerGstNumber) doc.text(`GSTIN: ${challan.customerGstNumber}`);

  doc.moveDown(1);

  // ---- Line items table ---------------------------------------------------
  const columns = [
    { label: '#', width: 26 },
    { label: 'PRODUCT', width: pageWidth - 26 - 90 - 55 - 70 - 80 },
    { label: 'SKU', width: 90 },
    { label: 'QTY', width: 55, align: 'right' as const },
    { label: 'RATE', width: 70, align: 'right' as const },
    { label: 'AMOUNT', width: 80, align: 'right' as const },
  ];

  const drawRow = (values: string[], options: { bold?: boolean; fill?: string } = {}) => {
    const rowY = doc.y;
    const height = 20;

    if (options.fill) {
      doc.rect(44, rowY - 4, pageWidth, height).fill(options.fill);
    }

    let x = 44;
    doc
      .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor('#111111');

    columns.forEach((column, index) => {
      doc.text(values[index], x + 4, rowY, {
        width: column.width - 8,
        align: column.align ?? 'left',
        lineBreak: false,
      });
      x += column.width;
    });

    doc.y = rowY + height - 4;
  };

  drawRow(
    columns.map((column) => column.label),
    { bold: true, fill: '#f1f3f6' },
  );

  challan.items.forEach((item, index) => {
    // Start a fresh page before the row would spill past the footer area.
    if (doc.y > doc.page.height - 140) {
      doc.addPage();
      drawRow(
        columns.map((column) => column.label),
        { bold: true, fill: '#f1f3f6' },
      );
    }

    drawRow([
      String(index + 1),
      item.productName,
      item.productSku,
      String(item.quantity),
      INR(item.unitPrice),
      INR(item.lineTotal),
    ]);

    doc
      .moveTo(44, doc.y)
      .lineTo(doc.page.width - 44, doc.y)
      .strokeColor('#eeeeee')
      .stroke();
  });

  // ---- Totals -------------------------------------------------------------
  doc.moveDown(0.8);
  const totalsX = doc.page.width - 44 - 200;

  doc.font('Helvetica').fontSize(10).fillColor('#555555');
  doc.text('Total quantity', totalsX, doc.y, { width: 120, align: 'right', continued: true });
  doc.fillColor('#111111').text(`  ${challan.totalQuantity}`, { align: 'right' });

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111');
  doc.text('Total amount', totalsX, doc.y + 4, { width: 120, align: 'right', continued: true });
  doc.text(`  ${INR(challan.totalAmount)}`, { align: 'right' });

  if (challan.notes) {
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text('Notes', 44);
    doc.font('Helvetica').fillColor('#555555').text(challan.notes, { width: pageWidth });
  }

  // ---- Footer -------------------------------------------------------------
  doc.moveDown(2.5);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#888888')
    .text(
      'This is a computer-generated delivery challan and does not require a physical signature.',
      44,
      doc.y,
      { width: pageWidth, align: 'center' },
    );

  doc.end();
};
