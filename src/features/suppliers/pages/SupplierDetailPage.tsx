import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2,
  Plus,
  ArrowLeft,
  AlertTriangle,
  HelpCircle,
  Upload,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { supplierRepository, purchasingRepository } from '../../../shared/adapters';
import {
  Supplier,
  SupplierContact,
  SupplierContract,
  SupplierProductItem,
  SupplierStatementEntry,
  SupplierPerformanceMetrics,
  SupplierAuditEntry,
} from '../types';
import { PurchaseOrder } from '../../purchasing/types';
import { formatMoney, formatDate, formatDateTime } from '../../../shared/utils/formatters';
import { qapikToAzn } from '../../../shared/utils/money';

export const SupplierDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [activeTab, setActiveTab] = useState<
    | 'general'
    | 'contacts'
    | 'contracts'
    | 'products'
    | 'orders'
    | 'invoices'
    | 'balance'
    | 'performance'
    | 'audit'
  >('general');

  const [isLoading, setIsLoading] = useState(true);

  // Tab sub-states
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [contracts, setContracts] = useState<SupplierContract[]>([]);
  const [products, setProducts] = useState<SupplierProductItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [statements, setStatements] = useState<SupplierStatementEntry[]>([]);
  const [performance, setPerformance] = useState<SupplierPerformanceMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<SupplierAuditEntry[]>([]);

  // Modals
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    position: '',
    phone: '',
    email: '',
    isPrimary: false,
  });

  const [contractForm, setContractForm] = useState({
    contractNumber: '',
    title: '',
    startDate: '',
    endDate: '',
    fileName: '',
    fileSize: 0,
    notes: '',
  });

  const loadAll = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const s = await supplierRepository.getSupplierById(id);
      if (!s) {
        toast({ title: 'Xəta', description: 'Təchizatçı tapılmadı', variant: 'danger' });
        navigate('/suppliers');
        return;
      }
      setSupplier(s);

      const [cList, cnrList, pList, ordList, stList, perf, aud] = await Promise.all([
        supplierRepository.getSupplierContacts(id),
        supplierRepository.getSupplierContracts(id),
        supplierRepository.getSupplierProducts(id),
        purchasingRepository.getPurchaseOrders({ supplierId: id }),
        supplierRepository.getSupplierStatement(id),
        supplierRepository.getSupplierPerformance(id),
        supplierRepository.getSupplierAuditLogs(id),
      ]);

      setContacts(cList);
      setContracts(cnrList);
      setProducts(pList);
      setOrders(ordList);
      setStatements(stList);
      setPerformance(perf);
      setAuditLogs(aud);
    } catch {
      toast({ title: 'Xəta', description: 'Məlumatları yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  if (isLoading || !supplier) {
    return (
      <div className="p-8 text-center text-bh-gray-500">
        Təchizatçı kartı yüklənir...
      </div>
    );
  }

  // Handle Contact Submit
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supplierRepository.saveSupplierContact({
        ...contactForm,
        supplierId: supplier.id,
      });
      toast({ title: 'Uğurlu', description: 'Yeni əlaqədar şəxs əlavə edildi' });
      setIsContactModalOpen(false);
      setContactForm({ name: '', position: '', phone: '', email: '', isPrimary: false });
      const c = await supplierRepository.getSupplierContacts(supplier.id);
      setContacts(c);
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  // Handle Contract File Upload (mocked with size/type validation max 10MB)
  const handleContractFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Fayl həcmi böyükdür',
        description: 'Müqavilə faylı maksimum 10 MB ola bilər!',
        variant: 'danger',
      });
      return;
    }

    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.pdf')) {
      toast({
        title: 'Yolverilməz format',
        description: 'Yalnız PDF və ya Word sənədləri qəbul edilir.',
        variant: 'danger',
      });
      return;
    }

    setContractForm({
      ...contractForm,
      fileName: file.name,
      fileSize: file.size,
    });
  };

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supplierRepository.saveSupplierContract({
        supplierId: supplier.id,
        contractNumber: contractForm.contractNumber,
        title: contractForm.title,
        startDate: contractForm.startDate,
        endDate: contractForm.endDate,
        fileName: contractForm.fileName || 'muqavile.pdf',
        fileSizeBytes: contractForm.fileSize || 1024000,
        notes: contractForm.notes,
        isExpiringSoon: false,
      });
      toast({ title: 'Uğurlu', description: 'Müqavilə sənədi qeydə alındı' });
      setIsContractModalOpen(false);
      const cnr = await supplierRepository.getSupplierContracts(supplier.id);
      setContracts(cnr);
    } catch (err: unknown) {
      toast({ title: 'Xəta', description: (err as Error).message, variant: 'danger' });
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Təchizatçılar', href: '/suppliers' },
          { label: supplier.name },
        ]}
      />

      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white dark:bg-bh-black-800 border border-bh-gray-200 dark:border-bh-black-700 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/suppliers')}
              className="p-1 h-7 w-7"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-bh-black-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-bh-black-700 dark:text-bh-gray-300" />
              {supplier.name}
            </h1>
            <Badge variant={supplier.status === 'active' ? 'success' : 'danger'}>
              {supplier.status === 'active' ? 'Aktiv Tərəfdaş' : 'Dayandırılıb'}
            </Badge>
            {supplier.isDemo && (
              <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono">
                DEMO
              </span>
            )}
          </div>
          <p className="text-xs text-bh-gray-500 dark:text-bh-gray-400 mt-1 ml-9">
            VÖEN: <span className="font-mono font-medium">{supplier.taxId}</span> | {supplier.legalName}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-bh-gray-500 uppercase tracking-wider block">
              Borc Balansı (Payable)
            </span>
            <span
              className={`text-lg font-bold font-mono ${
                supplier.payableBalance > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {formatMoney(supplier.payableBalance)}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => navigate(`/purchasing/orders/new?supplierId=${supplier.id}`)}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> Yeni PO Aç
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-bh-gray-200 dark:border-bh-black-700">
        <nav className="flex space-x-2 overflow-x-auto py-1">
          {[
            { id: 'general', label: 'Ümumi Məlumat' },
            { id: 'contacts', label: `Əlaqələr (${contacts.length})` },
            { id: 'contracts', label: `Müqavilələr (${contracts.length})` },
            { id: 'products', label: `Məhsullar (${products.length})` },
            { id: 'orders', label: `Satınalma Tarixçəsi (${orders.length})` },
            { id: 'invoices', label: 'Hesab-Fakturalar' },
            { id: 'balance', label: 'Borc Balansı (Ekstrakt)' },
            { id: 'performance', label: 'Performans (KPI)' },
            { id: 'audit', label: 'Audit Jurnalı' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'general' | 'contacts' | 'contracts' | 'products' | 'orders' | 'invoices' | 'balance' | 'performance' | 'audit')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-bh-gray-600 dark:text-bh-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* TAB CONTENT: 1. Ümumi */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-bh-black-900 dark:text-white border-b pb-2">
                Şirkət və Əlaqə Rekvizitləri
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-bh-gray-500 block">Əsas Əlaqədar Şəxs:</span>
                  <span className="font-medium text-bh-black-900 dark:text-white">
                    {supplier.contactPerson}
                  </span>
                </div>
                <div>
                  <span className="text-bh-gray-500 block">Telefon:</span>
                  <span className="font-medium text-bh-black-900 dark:text-white">
                    {supplier.phone}
                  </span>
                </div>
                <div>
                  <span className="text-bh-gray-500 block">E-poçt:</span>
                  <span className="font-medium text-bh-black-900 dark:text-white">
                    {supplier.email}
                  </span>
                </div>
                <div>
                  <span className="text-bh-gray-500 block">Ünvan:</span>
                  <span className="font-medium text-bh-black-900 dark:text-white">
                    {supplier.address}, {supplier.city}, {supplier.country}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-bh-black-900 dark:text-white border-b pb-2">
                Maliyyə və Bank Hesab Rekvizitləri
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-bh-gray-500 block">Ödəniş Şərti:</span>
                  <span className="font-medium font-mono text-bh-black-900 dark:text-white">
                    {supplier.paymentTerms.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-bh-gray-500 block">Tədarük Müddəti:</span>
                  <span className="font-medium text-bh-black-900 dark:text-white">
                    {supplier.leadTimeDays} gün
                  </span>
                </div>
                <div>
                  <span className="text-bh-gray-500 block">Bank Adı:</span>
                  <span className="font-medium text-bh-black-900 dark:text-white">
                    {supplier.bankDetails?.bankName || 'PAŞA Bank ASC'}
                  </span>
                </div>
                <div>
                  <span className="text-bh-gray-500 block">Bank VÖEN:</span>
                  <span className="font-mono text-bh-black-900 dark:text-white">
                    {supplier.bankDetails?.voen || '1400823561'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-bh-gray-500 block">IBAN Hesab Nömrəsi:</span>
                  <span className="font-mono font-medium text-bh-black-900 dark:text-white">
                    {supplier.bankDetails?.iban || 'AZ45PASHA1234567890123456789'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: 2. Əlaqələr */}
      {activeTab === 'contacts' && (
        <Card>
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-sm font-semibold">Təchizatçının Əlaqəli Şəxsləri</h3>
            <Button size="sm" onClick={() => setIsContactModalOpen(true)} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Əlaqə Əlavə Et
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase">
                <tr>
                  <th className="py-2.5 px-4">Ad və Soyad</th>
                  <th className="py-2.5 px-4">Vəzifə</th>
                  <th className="py-2.5 px-4">Telefon</th>
                  <th className="py-2.5 px-4">E-poçt</th>
                  <th className="py-2.5 px-4">Əsas Əlaqə</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 font-medium">{c.name}</td>
                    <td className="py-2.5 px-4">{c.position}</td>
                    <td className="py-2.5 px-4 font-mono">{c.phone}</td>
                    <td className="py-2.5 px-4 font-mono">{c.email}</td>
                    <td className="py-2.5 px-4">
                      {c.isPrimary ? (
                        <Badge variant="success">Əsas</Badge>
                      ) : (
                        <span className="text-bh-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 3. Müqavilələr və Sənədlər */}
      {activeTab === 'contracts' && (
        <Card>
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold">Hüquqi Müqavilələr və Razılaşmalar</h3>
              <p className="text-xs text-bh-gray-500">Maksimum fayl həcmi: 10 MB (PDF, Word)</p>
            </div>
            <Button size="sm" onClick={() => setIsContractModalOpen(true)} className="gap-1">
              <Upload className="w-3.5 h-3.5" /> Müqavilə Yüklə
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase">
                <tr>
                  <th className="py-2.5 px-4">Müqavilə №</th>
                  <th className="py-2.5 px-4">Mövzu</th>
                  <th className="py-2.5 px-4">Başlanğıc</th>
                  <th className="py-2.5 px-4">Bitmə Tarixi</th>
                  <th className="py-2.5 px-4">Status / Xatırlatma</th>
                  <th className="py-2.5 px-4">Fayl</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {contracts.map((cnr) => (
                  <tr key={cnr.id}>
                    <td className="py-2.5 px-4 font-mono font-medium">{cnr.contractNumber}</td>
                    <td className="py-2.5 px-4">{cnr.title}</td>
                    <td className="py-2.5 px-4">{formatDate(cnr.startDate)}</td>
                    <td className="py-2.5 px-4">{formatDate(cnr.endDate)}</td>
                    <td className="py-2.5 px-4">
                      {cnr.isExpiringSoon ? (
                        <Badge variant="warning" className="gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Müddəti bitir (&lt;30 gün)
                        </Badge>
                      ) : (
                        <Badge variant="success">Qüvvədədir</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-blue-600 underline cursor-pointer">
                        {cnr.fileName}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 4. Məhsullar və Qiymət Tarixçəsi */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <Card>
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Təchizatçı Nomenklaturası və Son Alış Qiymətləri</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Məhsul Adı</th>
                    <th className="py-2.5 px-4">Bizim SKU</th>
                    <th className="py-2.5 px-4">Təchizatçı SKU</th>
                    <th className="py-2.5 px-4 text-right">Son Alış Maya Dəyəri</th>
                    <th className="py-2.5 px-4">Min. Sifariş</th>
                    <th className="py-2.5 px-4">Tədarük (Gün)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 font-medium">{p.productName}</td>
                      <td className="py-2.5 px-4 font-mono">{p.sku}</td>
                      <td className="py-2.5 px-4 font-mono text-bh-gray-500">{p.supplierSku}</td>
                      <td className="py-2.5 px-4 text-right font-medium font-mono text-emerald-600">
                        {formatMoney(p.lastPurchasePrice)}
                      </td>
                      <td className="py-2.5 px-4">{p.minOrderQty} ədəd</td>
                      <td className="py-2.5 px-4">{p.leadTimeDays} gün</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Price History Chart */}
          {products.length > 0 && products[0].priceHistory.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-1">
                  Alış Qiymətinin Dinamikası: {products[0].productName}
                </h3>
                <p className="text-xs text-bh-gray-500 mb-4">
                  Zaman üzrə razılaşdırılmış maya dəyəri dəyişikliyi (₼)
                </p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={products[0].priceHistory.map((ph) => ({
                        date: ph.date,
                        price: qapikToAzn(ph.price),
                        po: ph.poNumber,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis unit=" ₼" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(val) => [`${val ?? 0} ₼`, 'Alış Qiyməti']}
                        labelFormatter={(l) => `Tarix: ${l}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB CONTENT: 5. Satınalma Tarixçəsi */}
      {activeTab === 'orders' && (
        <Card>
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-sm font-semibold">Təchizat Sifarişləri (POs)</h3>
            <Button
              size="sm"
              onClick={() => navigate(`/purchasing/orders/new?supplierId=${supplier.id}`)}
              className="gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Yeni Sifariş Aç
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase">
                <tr>
                  <th className="py-2.5 px-4">PO Nömrəsi</th>
                  <th className="py-2.5 px-4">Tarix</th>
                  <th className="py-2.5 px-4">Təhvil Anbarı</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Məbləğ (Cəmi)</th>
                  <th className="py-2.5 px-4 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 px-4 font-mono font-medium">{o.poNumber}</td>
                    <td className="py-2.5 px-4">{formatDate(o.orderDate)}</td>
                    <td className="py-2.5 px-4">{o.deliveryWarehouseName}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline">{o.status.toUpperCase()}</Badge>
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium font-mono">
                      {formatMoney(o.totalAmount)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/purchasing/orders/${o.id}`)}
                        className="h-7 text-xs"
                      >
                        Baxış
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 6. Hesab-Fakturalar */}
      {activeTab === 'invoices' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Təchizatçının Qeydiyyatdakı Fakturaları</h3>
          </div>
          <div className="p-6 text-center text-xs text-bh-gray-500">
            Fakturalar və üçtərəfli uyğunlaşma sənədlərinə baxmaq üçün Satınalma Fakturaları bölməsinə keçin.
            <div className="mt-3">
              <Button size="sm" onClick={() => navigate('/purchasing/invoices')}>
                Bütün Fakturalara Keç
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 7. Borc Balansı (Ekstrakt) */}
      {activeTab === 'balance' && (
        <Card>
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold">Hesab Ekstraktı (Statement Ledger)</h3>
              <p className="text-xs text-bh-gray-500">
                Debet (Fakturalar) və Kredit (Ödənişlər / Kredit Qeydləri) hərəkətləri
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-bh-gray-500 block">Cari Qalıq Borc:</span>
              <span className="text-sm font-bold font-mono text-rose-600">
                {formatMoney(supplier.payableBalance)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase">
                <tr>
                  <th className="py-2.5 px-4">Tarix</th>
                  <th className="py-2.5 px-4">Sənəd №</th>
                  <th className="py-2.5 px-4">Təyinat</th>
                  <th className="py-2.5 px-4 text-right">Debet (+)</th>
                  <th className="py-2.5 px-4 text-right">Kredit (-)</th>
                  <th className="py-2.5 px-4 text-right">Qalıq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
                {statements.map((st) => (
                  <tr key={st.id}>
                    <td className="py-2.5 px-4">{formatDateTime(st.date)}</td>
                    <td className="py-2.5 px-4 font-mono font-medium">{st.documentNumber}</td>
                    <td className="py-2.5 px-4">{st.description}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-rose-600">
                      {st.debit > 0 ? formatMoney(st.debit) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-emerald-600">
                      {st.credit > 0 ? formatMoney(st.credit) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold">
                      {formatMoney(st.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: 8. Performans (KPIs with formula tooltips) */}
      {activeTab === 'performance' && performance && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-bh-gray-500 uppercase">Vaxtında Çatdırılma</span>
                  <div className="group relative cursor-pointer">
                    <HelpCircle className="w-3.5 h-3.5 text-bh-gray-400" />
                    <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-52 p-2 bg-black text-white text-[11px] rounded shadow-lg z-20">
                      Formula: (Vaxtında çatdırılan sifarişlər / Ümumi çatdırılmış sifarişlər) × 100
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono mt-1 text-emerald-600">
                  %{performance.onTimeDeliveryRate.toFixed(1)}
                </div>
                <span className="text-[11px] text-bh-gray-400 mt-1 block">Hədəf: &ge; %95.0</span>
              </CardContent>
            </Card>

            {/* KPI 2 */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-bh-gray-500 uppercase">Fill Rate (Tamlıq)</span>
                  <div className="group relative cursor-pointer">
                    <HelpCircle className="w-3.5 h-3.5 text-bh-gray-400" />
                    <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-52 p-2 bg-black text-white text-[11px] rounded shadow-lg z-20">
                      Formula: (Faktiki təhvil alınan say / Sifariş edilən say) × 100
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono mt-1 text-emerald-600">
                  %{performance.fillRate.toFixed(1)}
                </div>
                <span className="text-[11px] text-bh-gray-400 mt-1 block">Hədəf: &ge; %95.0</span>
              </CardContent>
            </Card>

            {/* KPI 3 */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-bh-gray-500 uppercase">Kənarlaşma Nisbəti</span>
                  <div className="group relative cursor-pointer">
                    <HelpCircle className="w-3.5 h-3.5 text-bh-gray-400" />
                    <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-52 p-2 bg-black text-white text-[11px] rounded shadow-lg z-20">
                      Formula: (Kənarlaşma qeydə alınan qaimələr / Ümumi qaimələr) × 100
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono mt-1 text-rose-600">
                  %{performance.discrepancyRate.toFixed(1)}
                </div>
                <span className="text-[11px] text-bh-gray-400 mt-1 block">Hədəf: &le; %2.0</span>
              </CardContent>
            </Card>

            {/* KPI 4 */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-bh-gray-500 uppercase">Qiymət Kənarlaşması</span>
                  <div className="group relative cursor-pointer">
                    <HelpCircle className="w-3.5 h-3.5 text-bh-gray-400" />
                    <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-52 p-2 bg-black text-white text-[11px] rounded shadow-lg z-20">
                      Formula: ((Faktura qiyməti - Razılaşdırılmış PO qiyməti) / PO qiyməti) × 100
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono mt-1 text-bh-black-900 dark:text-white">
                  %{performance.priceVarianceRate.toFixed(1)}
                </div>
                <span className="text-[11px] text-bh-gray-400 mt-1 block">Tolerans həddi: %0.0</span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3">Tərəfdaşlıq Xülasəsi</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-bh-gray-50 dark:bg-bh-black-900 rounded">
                  <span className="text-bh-gray-500 block">Ümumi Sifariş Sayı:</span>
                  <span className="text-base font-bold text-bh-black-900 dark:text-white">
                    {performance.totalOrdersCount} sifariş
                  </span>
                </div>
                <div className="p-3 bg-bh-gray-50 dark:bg-bh-black-900 rounded">
                  <span className="text-bh-gray-500 block">Ümumi Satınalma Həcmi:</span>
                  <span className="text-base font-bold font-mono text-bh-black-900 dark:text-white">
                    {formatMoney(performance.totalSpend)}
                  </span>
                </div>
                <div className="p-3 bg-bh-gray-50 dark:bg-bh-black-900 rounded">
                  <span className="text-bh-gray-500 block">Orta Tədarük Müddəti:</span>
                  <span className="text-base font-bold text-bh-black-900 dark:text-white">
                    {performance.averageLeadTimeDays} gün
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: 9. Audit Jurnalı */}
      {activeTab === 'audit' && (
        <Card>
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Təchizatçı Kartı Üzrə Audit Tarixçəsi</h3>
          </div>
          <div className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 text-xs flex justify-between items-center">
                <div>
                  <span className="font-semibold text-bh-black-900 dark:text-white">
                    {log.action}
                  </span>
                  <span className="text-bh-gray-500 ml-2">({log.userName})</span>
                  {log.fieldChanged && (
                    <div className="text-[11px] text-bh-gray-400 mt-0.5">
                      Dəyişən sahə: {log.fieldChanged} ({log.oldValue} &rarr; {log.newValue})
                    </div>
                  )}
                </div>
                <span className="text-bh-gray-400 font-mono text-[11px]">
                  {formatDateTime(log.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal: Add Contact */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Yeni Əlaqədar Şəxs Əlavə Et"
      >
        <form onSubmit={handleSaveContact} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Ad və Soyad *</label>
            <input
              type="text"
              required
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Vəzifə *</label>
            <input
              type="text"
              required
              value={contactForm.position}
              onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })}
              className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Telefon *</label>
              <input
                type="text"
                required
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">E-poçt *</label>
              <input
                type="email"
                required
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isPrimary"
              checked={contactForm.isPrimary}
              onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="isPrimary" className="text-xs">
              Əsas əlaqədar şəxs kimi təyin et
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsContactModalOpen(false)}
            >
              Ləğv et
            </Button>
            <Button type="submit" size="sm">
              Əlavə et
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Contract */}
      <Modal
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
        title="Yeni Müqavilə və Sənəd Yüklənməsi"
      >
        <form onSubmit={handleSaveContract} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Müqavilə Nömrəsi *</label>
            <input
              type="text"
              required
              value={contractForm.contractNumber}
              onChange={(e) =>
                setContractForm({ ...contractForm, contractNumber: e.target.value })
              }
              className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              placeholder="məs. MÜQ-2026/015"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Müqavilənin Başlığı / Mövzusu *</label>
            <input
              type="text"
              required
              value={contractForm.title}
              onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
              className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              placeholder="Geyim Təchizatı Baş Razılaşması"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Başlanğıc Tarixi *</label>
              <input
                type="date"
                required
                value={contractForm.startDate}
                onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Bitmə Tarixi *</label>
              <input
                type="date"
                required
                value={contractForm.endDate}
                onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Fayl Seçin (Maks 10 MB, PDF/Word)</label>
            <input
              type="file"
              onChange={handleContractFileUpload}
              className="w-full text-xs"
              accept=".pdf,.doc,.docx"
            />
            {contractForm.fileName && (
              <span className="text-[11px] text-emerald-600 block mt-1">
                Seçildi: {contractForm.fileName} ({(contractForm.fileSize / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Qeydlər</label>
            <textarea
              rows={2}
              value={contractForm.notes}
              onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
              className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900"
              placeholder="Xüsusi şərtlər..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsContractModalOpen(false)}
            >
              Ləğv et
            </Button>
            <Button type="submit" size="sm">
              Yadda saxla
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
