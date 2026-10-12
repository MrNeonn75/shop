import {
  Supplier,
  SupplierContact,
  SupplierContract,
  SupplierProductItem,
  SupplierStatementEntry,
  SupplierPerformanceMetrics,
  SupplierAuditEntry,
  SupplierFilterParams,
} from '../../../features/suppliers/types';
import { SupplierRepository } from '../types';
import { PaginatedResult } from '../../types/models';
import { Qapik } from '../../utils/money';

export const INITIAL_MOCK_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Baku Fashion Textile MMC',
    legalName: 'Baku Fashion Textile Məhdud Məsuliyyətli Cəmiyyəti',
    taxId: '1401234567',
    status: 'active',
    contactPerson: 'Fuad Məmmədov',
    phone: '+994 12 440 22 11',
    email: 'info@bakufashion.az',
    address: 'Heydər Əliyev pr. 115',
    city: 'Bakı',
    country: 'Azərbaycan',
    paymentTerms: 'net30',
    currency: 'AZN',
    payableBalance: 1250000 as Qapik, // 12,500.00 AZN
    lastPurchaseDate: '2026-03-25T14:30:00Z',
    leadTimeDays: 5,
    rating: 5,
    bankDetails: {
      bankName: 'PAŞA Bank ASC',
      voen: '1400823561',
      iban: 'AZ45PASHA1234567890123456789',
      swift: 'PASHAZ22',
    },
    notes: 'Premium pambıq köynəklər və qadın geyimlərinin əsas təchizatçısı.',
    isDemo: true,
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2026-03-25T14:30:00Z',
  },
  {
    id: 'sup-2',
    name: 'Anadolu Dəri və Ayaqqabı ASC',
    legalName: 'Anadolu Dəri və Ayaqqabı Açıq Səhmdar Cəmiyyəti',
    taxId: '1802345678',
    status: 'active',
    contactPerson: 'Murat Yıldırım',
    phone: '+90 212 555 43 21',
    email: 'export@anadoluderi.com.tr',
    address: 'Organize Sanayi Bölgesi 4. Cadde No: 12',
    city: 'İstanbul',
    country: 'Türkiyə',
    paymentTerms: 'net45',
    currency: 'AZN',
    payableBalance: 3480000 as Qapik, // 34,800.00 AZN
    lastPurchaseDate: '2026-03-28T10:15:00Z',
    leadTimeDays: 12,
    rating: 4,
    bankDetails: {
      bankName: 'Kapital Bank ASC',
      voen: '1400034567',
      iban: 'AZ98KAPB1122334455667788990',
      swift: 'KAPBAZ22',
    },
    notes: 'Kişi və qadın dəri ayaqqabılarının birbaşa istehsalçısı.',
    isDemo: true,
    createdAt: '2024-02-15T09:00:00Z',
    updatedAt: '2026-03-28T10:15:00Z',
  },
  {
    id: 'sup-3',
    name: 'Silk Way Aksesuar Group',
    legalName: 'Silk Way Aksesuar Qrup MMC',
    taxId: '2003456789',
    status: 'active',
    contactPerson: 'Leyla Əliyeva',
    phone: '+994 50 234 56 78',
    email: 'contact@silkwayaksesuar.az',
    address: 'Nizami küç. 88, Sahil Plaza',
    city: 'Bakı',
    country: 'Azərbaycan',
    paymentTerms: 'net15',
    currency: 'AZN',
    payableBalance: 420000 as Qapik, // 4,200.00 AZN
    lastPurchaseDate: '2026-04-01T16:00:00Z',
    leadTimeDays: 3,
    rating: 5,
    bankDetails: {
      bankName: 'ABB (Azərbaycan Beynəlxalq Bankı)',
      voen: '9900001881',
      iban: 'AZ12IBAZ3801944000000123456',
      swift: 'IBAZAZ2X',
    },
    notes: 'Kəmərlər, qalstuklar, çantalar və zərgərlik aksesuarları.',
    isDemo: true,
    createdAt: '2024-05-12T12:00:00Z',
    updatedAt: '2026-04-01T16:00:00Z',
  },
  {
    id: 'sup-4',
    name: 'Milano Style Confezioni',
    legalName: 'Milano Style Confezioni S.r.l.',
    taxId: '2904567890',
    status: 'suspended',
    contactPerson: 'Marco Rossi',
    phone: '+39 02 8899 7766',
    email: 'orders@milanostyle.it',
    address: 'Via Montenapoleone 18',
    city: 'Milano',
    country: 'İtaliya',
    paymentTerms: 'net60',
    currency: 'EUR',
    payableBalance: 0 as Qapik,
    lastPurchaseDate: '2025-11-20T11:00:00Z',
    leadTimeDays: 20,
    rating: 3,
    notes: 'Müvəqqəti dayandırılıb (Gömrük sənədləşməsi yenilənir).',
    isDemo: true,
    createdAt: '2023-11-01T10:00:00Z',
    updatedAt: '2025-11-20T11:00:00Z',
  },
];

export const INITIAL_MOCK_CONTACTS: SupplierContact[] = [
  {
    id: 'cnt-1',
    supplierId: 'sup-1',
    name: 'Fuad Məmmədov',
    position: 'Satış Direktoru',
    phone: '+994 12 440 22 11',
    email: 'fuad@bakufashion.az',
    isPrimary: true,
  },
  {
    id: 'cnt-2',
    supplierId: 'sup-1',
    name: 'Aysel Quliyeva',
    position: 'Baş Mühasib',
    phone: '+994 50 330 11 22',
    email: 'muhasibat@bakufashion.az',
    isPrimary: false,
  },
  {
    id: 'cnt-3',
    supplierId: 'sup-2',
    name: 'Murat Yıldırım',
    position: 'İxracat Müdiri',
    phone: '+90 212 555 43 21',
    email: 'murat@anadoluderi.com.tr',
    isPrimary: true,
  },
];

export const INITIAL_MOCK_CONTRACTS: SupplierContract[] = [
  {
    id: 'cntr-1',
    supplierId: 'sup-1',
    contractNumber: 'MÜQ-2026/014',
    title: 'İllik Geyim və Tekstil Təchizatı Baş Müqaviləsi',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    status: 'active',
    fileName: 'muqavile_2026_baku_fashion.pdf',
    fileSizeBytes: 2450000,
    isExpiringSoon: false,
    uploadedAt: '2026-01-02T10:00:00Z',
    notes: 'Qeyd: İllik 100,000 AZN dövriyyə keçildikdə əlavə 3% bonus endirim tətbiq edilir.',
  },
  {
    id: 'cntr-2',
    supplierId: 'sup-1',
    contractNumber: 'MÜQ-2025/089',
    title: 'Xüsusi Mövsümi Qış Kolleksiyası Razılaşması',
    startDate: '2025-09-01T00:00:00Z',
    endDate: '2026-04-15T23:59:59Z',
    status: 'active',
    fileName: 'qis_kolleksiyasi_elave_razilasdirma.pdf',
    fileSizeBytes: 1850000,
    isExpiringSoon: true, // Ending soon!
    uploadedAt: '2025-09-02T11:00:00Z',
    notes: 'Müddət bitir: 15 aprel 2026. Yenilənmə tələb olunur.',
  },
];

export const INITIAL_MOCK_SUPPLIER_PRODUCTS: SupplierProductItem[] = [
  {
    id: 'sp-1',
    supplierId: 'sup-1',
    productId: 'prod-1',
    productName: 'Kişi Pambıq Köynək (Klassik)',
    sku: 'TSH-M-001',
    supplierSku: 'BFT-SHIRT-COTTON-01',
    lastPurchasePrice: 2450 as Qapik, // 24.50 AZN
    currency: 'AZN',
    leadTimeDays: 5,
    minOrderQty: 20,
    priceHistory: [
      { date: '2025-10-10', price: 2200 as Qapik, poNumber: 'PO-2025-081' },
      { date: '2026-01-15', price: 2350 as Qapik, poNumber: 'PO-2026-004' },
      { date: '2026-03-20', price: 2450 as Qapik, poNumber: 'PO-2026-012' },
    ],
  },
  {
    id: 'sp-2',
    supplierId: 'sup-1',
    productId: 'prod-2',
    productName: 'Qadın Zərif İpək Kofta',
    sku: 'BLZ-W-002',
    supplierSku: 'BFT-SILK-TOP-99',
    lastPurchasePrice: 3800 as Qapik, // 38.00 AZN
    currency: 'AZN',
    leadTimeDays: 7,
    minOrderQty: 15,
    priceHistory: [
      { date: '2025-11-05', price: 3600 as Qapik, poNumber: 'PO-2025-095' },
      { date: '2026-02-12', price: 3800 as Qapik, poNumber: 'PO-2026-008' },
    ],
  },
];

export const INITIAL_MOCK_STATEMENTS: SupplierStatementEntry[] = [
  {
    id: 'stmt-1',
    supplierId: 'sup-1',
    date: '2026-03-01T10:00:00Z',
    type: 'invoice',
    documentNumber: 'INV-2026-010',
    description: 'Satınalma Qaiməsi #PO-2026-010 üzrə',
    debit: 1500000 as Qapik, // +15,000 AZN borc
    credit: 0 as Qapik,
    balanceAfter: 1500000 as Qapik,
  },
  {
    id: 'stmt-2',
    supplierId: 'sup-1',
    date: '2026-03-15T14:30:00Z',
    type: 'payment',
    documentNumber: 'PMT-2026-005',
    description: 'Bank köçürməsi (PAŞA Bank №892314)',
    debit: 0 as Qapik,
    credit: 1000000 as Qapik, // -10,000 AZN ödəniş
    balanceAfter: 500000 as Qapik,
  },
  {
    id: 'stmt-3',
    supplierId: 'sup-1',
    date: '2026-03-25T11:00:00Z',
    type: 'invoice',
    documentNumber: 'INV-2026-014',
    description: 'Satınalma Qaiməsi #PO-2026-014 üzrə',
    debit: 750000 as Qapik, // +7,500 AZN borc
    credit: 0 as Qapik,
    balanceAfter: 1250000 as Qapik, // Cari qalıq 12,500 AZN
  },
];

export const INITIAL_MOCK_AUDIT: SupplierAuditEntry[] = [
  {
    id: 'aud-1',
    timestamp: '2026-03-25T14:30:00Z',
    userName: 'Kamran Əliyev (Baş menecer)',
    action: 'Qaimə təsdiqləndi',
    fieldChanged: 'payableBalance',
    oldValue: '5,000.00 ₼',
    newValue: '12,500.00 ₼',
  },
  {
    id: 'aud-2',
    timestamp: '2026-01-10T10:00:00Z',
    userName: 'Sistem Admini',
    action: 'Təchizatçı yaradıldı',
  },
];

export class MockSupplierAdapter implements SupplierRepository {
  private suppliers: Supplier[] = [...INITIAL_MOCK_SUPPLIERS];
  private contacts: SupplierContact[] = [...INITIAL_MOCK_CONTACTS];
  private contracts: SupplierContract[] = [...INITIAL_MOCK_CONTRACTS];
  private products: SupplierProductItem[] = [...INITIAL_MOCK_SUPPLIER_PRODUCTS];
  private statements: SupplierStatementEntry[] = [...INITIAL_MOCK_STATEMENTS];
  private auditLogs: SupplierAuditEntry[] = [...INITIAL_MOCK_AUDIT];

  async getSuppliers(params?: SupplierFilterParams): Promise<PaginatedResult<Supplier>> {
    let result = [...this.suppliers];

    if (params?.search) {
      const q = params.search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.taxId.includes(q) ||
          s.contactPerson.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
      );
    }

    if (params?.status && params.status !== 'all') {
      result = result.filter((s) => s.status === params.status);
    }

    if (params?.paymentTerms && params.paymentTerms !== 'all') {
      result = result.filter((s) => s.paymentTerms === params.paymentTerms);
    }

    if (params?.currency && params.currency !== 'all') {
      result = result.filter((s) => s.currency === params.currency);
    }

    if (params?.hasOutstandingBalance) {
      result = result.filter((s) => s.payableBalance > 0);
    }

    const total = result.length;
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const startIndex = (page - 1) * pageSize;
    const items = result.slice(startIndex, startIndex + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSupplierById(id: string): Promise<Supplier | null> {
    const s = this.suppliers.find((item) => item.id === id);
    return s ? { ...s } : null;
  }

  async createSupplier(
    payload: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<Supplier> {
    const newSupplier: Supplier = {
      ...payload,
      id: `sup-${Date.now()}`,
      payableBalance: (payload.payableBalance ?? 0) as Qapik,
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.suppliers.unshift(newSupplier);
    this.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userName: 'Cari İstifadəçi',
      action: 'Yeni təchizatçı qeydiyyata alındı',
      fieldChanged: 'name',
      newValue: newSupplier.name,
    });
    return { ...newSupplier };
  }

  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<Supplier> {
    const index = this.suppliers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`Təchizatçı tapılmadı: ${id}`);
    }
    const current = this.suppliers[index];
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.suppliers[index] = updated;
    return { ...updated };
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const index = this.suppliers.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.suppliers.splice(index, 1);
    return true;
  }

  async getSupplierContacts(supplierId: string): Promise<SupplierContact[]> {
    return this.contacts.filter((c) => c.supplierId === supplierId);
  }

  async saveSupplierContact(contact: Partial<SupplierContact>): Promise<SupplierContact> {
    if (contact.id) {
      const idx = this.contacts.findIndex((c) => c.id === contact.id);
      if (idx !== -1) {
        this.contacts[idx] = { ...this.contacts[idx], ...contact } as SupplierContact;
        return { ...this.contacts[idx] };
      }
    }
    const newContact: SupplierContact = {
      id: `cnt-${Date.now()}`,
      supplierId: contact.supplierId || '',
      name: contact.name || '',
      position: contact.position || '',
      phone: contact.phone || '',
      email: contact.email || '',
      isPrimary: contact.isPrimary ?? false,
    };
    this.contacts.push(newContact);
    return { ...newContact };
  }

  async deleteSupplierContact(id: string): Promise<boolean> {
    const idx = this.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.contacts.splice(idx, 1);
    return true;
  }

  async getSupplierContracts(supplierId: string): Promise<SupplierContract[]> {
    return this.contracts.filter((c) => c.supplierId === supplierId);
  }

  async saveSupplierContract(contract: Partial<SupplierContract>): Promise<SupplierContract> {
    const newCntr: SupplierContract = {
      id: contract.id || `cntr-${Date.now()}`,
      supplierId: contract.supplierId || '',
      contractNumber: contract.contractNumber || `MÜQ-${Date.now()}`,
      title: contract.title || 'Müqavilə',
      startDate: contract.startDate || new Date().toISOString(),
      endDate: contract.endDate || new Date().toISOString(),
      status: contract.status || 'active',
      fileName: contract.fileName,
      fileSizeBytes: contract.fileSizeBytes,
      isExpiringSoon: contract.isExpiringSoon,
      uploadedAt: new Date().toISOString(),
      notes: contract.notes,
    };
    this.contracts.unshift(newCntr);
    return { ...newCntr };
  }

  async getSupplierProducts(supplierId: string): Promise<SupplierProductItem[]> {
    return this.products.filter((p) => p.supplierId === supplierId);
  }

  async getSupplierStatement(supplierId: string): Promise<SupplierStatementEntry[]> {
    return this.statements.filter((s) => s.supplierId === supplierId);
  }

  async getSupplierPerformance(supplierId: string): Promise<SupplierPerformanceMetrics> {
    // If sup-1 return high metrics, others realistic demo
    if (supplierId === 'sup-1') {
      return {
        onTimeDeliveryRate: 96.5,
        fillRate: 98.2,
        discrepancyRate: 1.8,
        priceVarianceRate: 0.5,
        totalOrdersCount: 24,
        totalSpend: 18500000 as Qapik, // 185,000 AZN
        averageLeadTimeDays: 4.8,
      };
    }
    return {
      onTimeDeliveryRate: 91.0,
      fillRate: 94.5,
      discrepancyRate: 3.2,
      priceVarianceRate: 1.2,
      totalOrdersCount: 12,
      totalSpend: 7420000 as Qapik,
      averageLeadTimeDays: 8.5,
    };
  }

  async getSupplierAuditLogs(_supplierId?: string): Promise<SupplierAuditEntry[]> {
    return this.auditLogs;
  }
}
