import { Qapik } from '../../../shared/utils/money';

export type SupplierStatus = 'active' | 'suspended' | 'pending';
export type PaymentTerms = 'immediate' | 'net15' | 'net30' | 'net45' | 'net60' | 'custom';
export type SupplierCurrency = 'AZN' | 'USD' | 'EUR' | 'TRY';

export interface SupplierContact {
  id: string;
  supplierId: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface SupplierContract {
  id: string;
  supplierId: string;
  contractNumber: string;
  title: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'terminated';
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  isExpiringSoon?: boolean; // <= 30 days
  uploadedAt: string;
  notes?: string;
}

export interface SupplierProductPricePoint {
  date: string;
  price: Qapik;
  poNumber: string;
}

export interface SupplierProductItem {
  id: string;
  supplierId: string;
  productId: string;
  productName: string;
  sku: string;
  supplierSku: string;
  lastPurchasePrice: Qapik;
  currency: SupplierCurrency;
  leadTimeDays: number;
  minOrderQty: number;
  priceHistory: SupplierProductPricePoint[];
}

export interface SupplierStatementEntry {
  id: string;
  supplierId: string;
  date: string;
  type: 'invoice' | 'payment' | 'credit_note';
  documentNumber: string;
  description: string;
  debit: Qapik;   // Artım / Borc (Invoice)
  credit: Qapik;  // Azalma / Ödəniş (Payment / Credit Note)
  balanceAfter: Qapik;
}

export interface SupplierPerformanceMetrics {
  onTimeDeliveryRate: number; // Formula: (Vaxtında çatdırılan sifarişlər / Ümumi çatdırılmış sifarişlər) * 100
  fillRate: number;           // Formula: (Təhvil alınan faktiki say / Sifariş edilən say) * 100
  discrepancyRate: number;    // Formula: (Kənarlaşma qeydə alınan qaimələr / Ümumi qaimələr) * 100
  priceVarianceRate: number;  // Formula: ((Faktura qiyməti - Sifariş qiyməti) / Sifariş qiyməti) * 100
  totalOrdersCount: number;
  totalSpend: Qapik;
  averageLeadTimeDays: number;
}

export interface SupplierAuditEntry {
  id: string;
  timestamp: string;
  userName: string;
  action: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
}

export interface Supplier {
  id: string;
  name: string;
  legalName: string;
  taxId: string; // VÖEN (10 digits)
  status: SupplierStatus;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  paymentTerms: PaymentTerms;
  customPaymentDays?: number;
  currency: SupplierCurrency;
  payableBalance: Qapik; // Məbləğ qəpiklə (məs. 4500.00 AZN -> 450000)
  lastPurchaseDate?: string;
  bankDetails?: {
    bankName: string;
    voen: string;
    iban: string;
    swift: string;
  };
  leadTimeDays: number;
  notes?: string;
  rating?: number; // 1-5
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierFilterParams {
  search?: string;
  status?: SupplierStatus | 'all';
  paymentTerms?: PaymentTerms | 'all';
  currency?: SupplierCurrency | 'all';
  hasOutstandingBalance?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

