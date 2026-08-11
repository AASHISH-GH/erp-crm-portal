export type Role = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTS';
export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR';
export type CustomerStatus = 'LEAD' | 'ACTIVE' | 'INACTIVE';
export type MovementType = 'IN' | 'OUT';
export type ChallanStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  type: CustomerType;
  address: string | null;
  status: CustomerStatus;
  followUpDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: Actor | null;
  _count?: { followUps: number; challans: number };
  followUps?: FollowUp[];
  challans?: ChallanSummary[];
}

export interface FollowUp {
  id: string;
  customerId: string;
  note: string;
  nextFollowUp: string | null;
  createdAt: string;
  createdBy?: Actor | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitPrice: string;
  currentStock: number;
  minStockAlert: number;
  location: string;
  isActive: boolean;
  createdAt: string;
  isLowStock?: boolean;
  movements?: StockMovement[];
}

export interface StockMovement {
  id: string;
  productId: string;
  quantity: number;
  type: MovementType;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  stockAfter: number;
  createdAt: string;
  product?: { id: string; name: string; sku: string; location?: string };
  createdBy?: Actor | null;
}

export interface ChallanItem {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string;
  productCategory: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface ChallanSummary {
  id: string;
  challanNumber: string;
  customerName?: string;
  status: ChallanStatus;
  totalQuantity: number;
  totalAmount: string;
  createdAt: string;
  createdBy?: Actor | null;
  _count?: { items: number };
}

export interface Challan extends ChallanSummary {
  customerId: string | null;
  customerName: string;
  customerBusinessName: string | null;
  customerMobile: string | null;
  customerGstNumber: string | null;
  customerAddress: string | null;
  notes: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  items: ChallanItem[];
  customer?: { id: string; name: string; businessName: string | null } | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface DashboardSummary {
  customers: { total: number; active: number; leads: number; dueFollowUps: number };
  products: { total: number; lowStock: number; stockValue: number };
  challans: { draft: number; confirmed: number; cancelled: number; total: number };
  today: { confirmedChallans: number; quantityDispatched: number; amount: number };
  lowStockList: Array<{
    id: string;
    name: string;
    sku: string;
    currentStock: number;
    minStockAlert: number;
  }>;
  recentMovements: StockMovement[];
  recentChallans: ChallanSummary[];
}
