import bcrypt from 'bcryptjs';
import {
  ChallanStatus,
  CustomerStatus,
  CustomerType,
  MovementType,
  PrismaClient,
  Role,
} from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Password@123';

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  return date;
};

const USERS = [
  { name: 'Aarav Mehta', email: 'admin@erpcrm.test', role: Role.ADMIN },
  { name: 'Priya Sharma', email: 'sales@erpcrm.test', role: Role.SALES },
  { name: 'Rohit Verma', email: 'warehouse@erpcrm.test', role: Role.WAREHOUSE },
  { name: 'Neha Iyer', email: 'accounts@erpcrm.test', role: Role.ACCOUNTS },
];

const CUSTOMERS = [
  {
    name: 'Suresh Patel',
    mobile: '9822011223',
    email: 'suresh@patelstores.in',
    businessName: 'Patel General Stores',
    gstNumber: '27AAPFU0939F1ZV',
    type: CustomerType.RETAIL,
    address: 'Shop 4, Market Road, Pune 411002',
    status: CustomerStatus.ACTIVE,
    followUpDate: daysFromNow(-1),
    notes: 'Reliable payer. Prefers delivery before noon.',
  },
  {
    name: 'Meena Kulkarni',
    mobile: '9765443321',
    email: 'meena@kulkarnitraders.com',
    businessName: 'Kulkarni Traders',
    gstNumber: '27AACCK1234M1Z9',
    type: CustomerType.WHOLESALE,
    address: 'Gala 7, Bhosari MIDC, Pune 411026',
    status: CustomerStatus.ACTIVE,
    followUpDate: daysFromNow(3),
    notes: 'Bulk orders every fortnight. Negotiated rates on detergents.',
  },
  {
    name: 'Imran Shaikh',
    mobile: '9911223344',
    email: 'imran@westlinedist.in',
    businessName: 'Westline Distributors',
    gstNumber: '27AAGCW8899K1ZP',
    type: CustomerType.DISTRIBUTOR,
    address: 'Warehouse 2, Chakan Industrial Belt, Pune 410501',
    status: CustomerStatus.ACTIVE,
    followUpDate: daysFromNow(7),
    notes: 'Covers three districts. Wants a quarterly pricing review.',
  },
  {
    name: 'Anjali Rao',
    mobile: '9845567788',
    email: 'anjali.rao@gmail.com',
    businessName: 'Rao Provision Mart',
    type: CustomerType.RETAIL,
    address: 'Near Bus Stand, Nashik 422001',
    status: CustomerStatus.LEAD,
    followUpDate: daysFromNow(0),
    notes: 'Enquired at the trade expo. Needs a rate card.',
  },
  {
    name: 'Vikram Desai',
    mobile: '9700112233',
    businessName: 'Desai Enterprises',
    type: CustomerType.WHOLESALE,
    address: 'Station Road, Nagpur 440001',
    status: CustomerStatus.LEAD,
    followUpDate: daysFromNow(2),
    notes: 'Price sensitive. Comparing us against two other suppliers.',
  },
  {
    name: 'Fatima Ansari',
    mobile: '9812345670',
    email: 'fatima@ansaristores.in',
    businessName: 'Ansari Stores',
    type: CustomerType.RETAIL,
    address: 'Old City, Aurangabad 431001',
    status: CustomerStatus.INACTIVE,
    notes: 'Dormant since last season. Worth one more call.',
  },
];

const PRODUCTS = [
  { name: 'Sunflower Oil 1L Pouch', sku: 'OIL-SUN-1L', category: 'Edible Oil', unitPrice: 142.5, currentStock: 480, minStockAlert: 100, location: 'RACK-A1' },
  { name: 'Basmati Rice 5kg Bag', sku: 'RICE-BAS-5KG', category: 'Staples', unitPrice: 585.0, currentStock: 220, minStockAlert: 60, location: 'RACK-A2' },
  { name: 'Detergent Powder 1kg', sku: 'DET-PWD-1KG', category: 'Home Care', unitPrice: 118.0, currentStock: 40, minStockAlert: 75, location: 'RACK-B1' },
  { name: 'Toothpaste 200g', sku: 'ORAL-TP-200G', category: 'Personal Care', unitPrice: 96.0, currentStock: 310, minStockAlert: 80, location: 'RACK-B2' },
  { name: 'Tea Leaves 500g', sku: 'BEV-TEA-500G', category: 'Beverages', unitPrice: 245.0, currentStock: 150, minStockAlert: 50, location: 'RACK-C1' },
  { name: 'Wheat Flour 10kg', sku: 'FLR-WHT-10KG', category: 'Staples', unitPrice: 410.0, currentStock: 95, minStockAlert: 40, location: 'RACK-A3' },
  { name: 'Dish Wash Bar 300g', sku: 'DISH-BAR-300G', category: 'Home Care', unitPrice: 38.0, currentStock: 18, minStockAlert: 60, location: 'RACK-B3' },
  { name: 'Biscuits Family Pack', sku: 'SNK-BIS-FAM', category: 'Snacks', unitPrice: 72.0, currentStock: 640, minStockAlert: 120, location: 'RACK-D1' },
  { name: 'Toilet Soap 125g', sku: 'PC-SOAP-125G', category: 'Personal Care', unitPrice: 45.0, currentStock: 520, minStockAlert: 100, location: 'RACK-B4' },
  { name: 'Refined Sugar 1kg', sku: 'STP-SUG-1KG', category: 'Staples', unitPrice: 52.0, currentStock: 380, minStockAlert: 90, location: 'RACK-A4' },
];

async function main() {
  console.log('Seeding database...');

  // Wipe in FK-safe order so the seed is repeatable.
  await prisma.challanItem.deleteMany();
  await prisma.challan.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.documentCounter.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const users = await Promise.all(
    USERS.map((user) => prisma.user.create({ data: { ...user, passwordHash } })),
  );

  const admin = users.find((user) => user.role === Role.ADMIN)!;
  const sales = users.find((user) => user.role === Role.SALES)!;
  const warehouse = users.find((user) => user.role === Role.WAREHOUSE)!;

  console.log(`  ${users.length} users`);

  const customers = await Promise.all(
    CUSTOMERS.map((customer) =>
      prisma.customer.create({ data: { ...customer, createdById: sales.id } }),
    ),
  );
  console.log(`  ${customers.length} customers`);

  await prisma.followUp.createMany({
    data: [
      { customerId: customers[0].id, note: 'Called for monthly order. Wants oil and rice next week.', nextFollowUp: daysFromNow(5), createdById: sales.id },
      { customerId: customers[1].id, note: 'Shared updated rate card for detergents.', nextFollowUp: daysFromNow(3), createdById: sales.id },
      { customerId: customers[2].id, note: 'Quarterly review scheduled. Discuss distributor margin.', nextFollowUp: daysFromNow(7), createdById: sales.id },
      { customerId: customers[3].id, note: 'Met at trade expo. Sent catalogue over WhatsApp.', nextFollowUp: daysFromNow(0), createdById: sales.id },
      { customerId: customers[4].id, note: 'Asked for 60-day credit. Escalated to accounts.', nextFollowUp: daysFromNow(2), createdById: sales.id },
    ],
  });
  console.log('  5 follow-ups');

  const products = await Promise.all(
    PRODUCTS.map((product) => prisma.product.create({ data: product })),
  );

  // Opening stock is recorded in the ledger so on-hand quantities are explainable.
  await prisma.stockMovement.createMany({
    data: products.map((product) => ({
      productId: product.id,
      quantity: product.currentStock,
      type: MovementType.IN,
      reason: 'Opening stock',
      referenceType: 'SEED',
      stockAfter: product.currentStock,
      createdById: warehouse.id,
    })),
  });
  console.log(`  ${products.length} products (+ opening stock movements)`);

  // A goods-receipt style top-up so the ledger has more than one kind of entry.
  const restocked = products[1];
  await prisma.$transaction([
    prisma.product.update({
      where: { id: restocked.id },
      data: { currentStock: { increment: 100 } },
    }),
    prisma.stockMovement.create({
      data: {
        productId: restocked.id,
        quantity: 100,
        type: MovementType.IN,
        reason: 'Purchase receipt - PO/2026/0112',
        referenceType: 'MANUAL_ADJUSTMENT',
        stockAfter: restocked.currentStock + 100,
        createdById: warehouse.id,
      },
    }),
  ]);

  // --- Challans -----------------------------------------------------------
  // One confirmed (stock deducted through the ledger) and one draft (no stock impact),
  // so a reviewer can see both sides of the business rule immediately.
  const period = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const confirmedLines = [
    { product: products[0], quantity: 24 },
    { product: products[4], quantity: 10 },
  ];

  const confirmedTotalQty = confirmedLines.reduce((sum, line) => sum + line.quantity, 0);
  const confirmedTotalAmount = confirmedLines.reduce(
    (sum, line) => sum + Number(line.product.unitPrice) * line.quantity,
    0,
  );

  const confirmedChallan = await prisma.challan.create({
    data: {
      challanNumber: `CH-${period}-0001`,
      customerId: customers[1].id,
      customerName: customers[1].name,
      customerBusinessName: customers[1].businessName,
      customerMobile: customers[1].mobile,
      customerGstNumber: customers[1].gstNumber,
      customerAddress: customers[1].address,
      status: ChallanStatus.CONFIRMED,
      totalQuantity: confirmedTotalQty,
      totalAmount: confirmedTotalAmount,
      notes: 'Deliver with the Thursday route van.',
      createdById: sales.id,
      confirmedAt: new Date(),
      items: {
        create: confirmedLines.map((line) => ({
          productId: line.product.id,
          productName: line.product.name,
          productSku: line.product.sku,
          productCategory: line.product.category,
          unitPrice: line.product.unitPrice,
          quantity: line.quantity,
          lineTotal: Number(line.product.unitPrice) * line.quantity,
        })),
      },
    },
  });

  for (const line of confirmedLines) {
    const updated = await prisma.product.update({
      where: { id: line.product.id },
      data: { currentStock: { decrement: line.quantity } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: line.product.id,
        quantity: line.quantity,
        type: MovementType.OUT,
        reason: `Sales challan ${confirmedChallan.challanNumber}`,
        referenceType: 'CHALLAN',
        referenceId: confirmedChallan.id,
        stockAfter: updated.currentStock,
        createdById: sales.id,
      },
    });
  }

  const draftLines = [
    { product: products[7], quantity: 50 },
    { product: products[8], quantity: 30 },
  ];

  await prisma.challan.create({
    data: {
      challanNumber: `CH-${period}-0002`,
      customerId: customers[0].id,
      customerName: customers[0].name,
      customerBusinessName: customers[0].businessName,
      customerMobile: customers[0].mobile,
      customerGstNumber: customers[0].gstNumber,
      customerAddress: customers[0].address,
      status: ChallanStatus.DRAFT,
      totalQuantity: draftLines.reduce((sum, line) => sum + line.quantity, 0),
      totalAmount: draftLines.reduce(
        (sum, line) => sum + Number(line.product.unitPrice) * line.quantity,
        0,
      ),
      notes: 'Awaiting confirmation from the customer on quantities.',
      createdById: sales.id,
      items: {
        create: draftLines.map((line) => ({
          productId: line.product.id,
          productName: line.product.name,
          productSku: line.product.sku,
          productCategory: line.product.category,
          unitPrice: line.product.unitPrice,
          quantity: line.quantity,
          lineTotal: Number(line.product.unitPrice) * line.quantity,
        })),
      },
    },
  });

  // Keep the counter in step with the two challans created above.
  await prisma.documentCounter.create({ data: { key: `CH-${period}`, value: 2 } });
  console.log('  2 challans (1 confirmed, 1 draft)');

  console.log('\nSeed complete. Login credentials:');
  USERS.forEach((user) => console.log(`  ${user.role.padEnd(10)} ${user.email}  /  ${PASSWORD}`));
  console.log(`\n  (admin user id: ${admin.id})`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
