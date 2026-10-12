import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Plus,
  Search,
  Download,
  Phone,
  User,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { supplierRepository } from '../../../shared/adapters';
import { Supplier, SupplierStatus, PaymentTerms } from '../types';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { detectDuplicateSupplier, supplierFormSchema } from '../schemas/supplierSchema';
import { usePermission } from '../../../shared/hooks/usePermission';

export const SuppliersListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { can } = usePermission();

  const canManage = can('procurement.suppliers.manage');

  // Filters from URL
  const search = searchParams.get('search') || '';
  const status = (searchParams.get('status') as SupplierStatus | 'all') || 'all';
  const paymentTerms = (searchParams.get('terms') as PaymentTerms | 'all') || 'all';
  const onlyWithDebt = searchParams.get('debt') === 'true';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    taxId: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: 'Bakı şəhəri',
    paymentTerms: 'net30' as PaymentTerms,
    currency: 'AZN' as 'AZN' | 'USD' | 'EUR' | 'TRY',
    leadTimeDays: 7,
    notes: '',
    bankName: 'PAŞA Bank ASC',
    iban: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Duplicate detection state
  const duplicateCheck = useMemo(() => {
    if (!formData.taxId && !formData.name) return { hasDuplicate: false };
    return detectDuplicateSupplier(suppliers, {
      taxId: formData.taxId,
      name: formData.name,
    });
  }, [suppliers, formData.taxId, formData.name]);

  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const res = await supplierRepository.getSuppliers({
        search,
        status: status !== 'all' ? status : undefined,
        paymentTerms: paymentTerms !== 'all' ? paymentTerms : undefined,
        hasOutstandingBalance: onlyWithDebt ? true : undefined,
      });
      setSuppliers(res.items);
    } catch {
      toast({
        title: 'Xəta',
        description: 'Təchizatçı siyahısını yükləmək mümkün olmadı',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search, status, paymentTerms, onlyWithDebt]);

  const handleSearchChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('search', val);
    else next.delete('search');
    setSearchParams(next);
  };

  const handleStatusChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val !== 'all') next.set('status', val);
    else next.delete('status');
    setSearchParams(next);
  };

  const handleTermsChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val !== 'all') next.set('terms', val);
    else next.delete('terms');
    setSearchParams(next);
  };

  const handleToggleDebt = () => {
    const next = new URLSearchParams(searchParams);
    if (!onlyWithDebt) next.set('debt', 'true');
    else next.delete('debt');
    setSearchParams(next);
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['Ad', 'VÖEN', 'Status', 'Əlaqədar şəxs', 'Telefon', 'E-poçt', 'Ödəniş şərti', 'Borc Qalığı'];
    const rows = suppliers.map((s) => [
      `"${s.name}"`,
      `"${s.taxId}"`,
      s.status,
      `"${s.contactPerson}"`,
      `"${s.phone}"`,
      `"${s.email}"`,
      s.paymentTerms,
      formatMoney(s.payableBalance),
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `techizatcilar_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Uğurlu', description: 'Təchizatçılar CSV faylına ixrac edildi' });
  };

  // Submit create form
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const parseResult = supplierFormSchema.safeParse({
      name: formData.name,
      legalName: formData.legalName,
      taxId: formData.taxId,
      contactPerson: formData.contactPerson,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      paymentTerms: formData.paymentTerms,
      currency: formData.currency,
      leadTimeDays: Number(formData.leadTimeDays),
      notes: formData.notes,
      bankDetails: {
        bankName: formData.bankName,
        iban: formData.iban,
      },
    });

    if (!parseResult.success) {
      const errs: Record<string, string> = {};
      parseResult.error.errors.forEach((err) => {
        if (err.path[0]) errs[String(err.path[0])] = err.message;
      });
      setFormErrors(errs);
      return;
    }

    if (duplicateCheck.hasDuplicate) {
      toast({
        title: 'Təkrarlanan Məlumat!',
        description: duplicateCheck.message,
        variant: 'danger',
      });
      return;
    }

    try {
      await supplierRepository.createSupplier({
        name: formData.name,
        legalName: formData.legalName,
        taxId: formData.taxId,
        status: 'active',
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        city: 'Bakı',
        country: 'Azərbaycan',
        paymentTerms: formData.paymentTerms,
        currency: formData.currency,
        payableBalance: 0 as import('../../../shared/utils/money').Qapik,
        leadTimeDays: Number(formData.leadTimeDays),
        bankDetails: {
          bankName: formData.bankName,
          voen: formData.taxId,
          iban: formData.iban,
          swift: 'PASHAZ22',
        },
        notes: formData.notes,
      });

      toast({
        title: 'Təchizatçı Yaradıldı',
        description: `"${formData.name}" uğurla qeydiyyata alındı (DEMO)`,
      });
      setIsCreateModalOpen(false);
      setFormData({
        name: '',
        legalName: '',
        taxId: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: 'Bakı şəhəri',
        paymentTerms: 'net30',
        currency: 'AZN',
        leadTimeDays: 7,
        notes: '',
        bankName: 'PAŞA Bank ASC',
        iban: '',
      });
      loadSuppliers();
    } catch (err: unknown) {
      toast({
        title: 'Xəta',
        description: (err as Error).message || 'Təchizatçı yaradıla bilmədi',
        variant: 'danger',
      });
    }
  };

  const getStatusBadge = (s: SupplierStatus) => {
    switch (s) {
      case 'active':
        return <Badge variant="success">Aktiv</Badge>;
      case 'suspended':
        return <Badge variant="danger">Dayandırılıb</Badge>;
      case 'pending':
        return <Badge variant="warning">Gözləmədə</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/catalog' },
          { label: 'Təchizatçılar' },
        ]}
      />

      <PageHeader
        title="Təchizatçıların İdarə Edilməsi"
        description="Yerli və xarici tərəfdaşlar, müqavilələr, qiymət tarixi və borc-alacaq qalıqları."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
              <Download className="w-4 h-4" /> İxrac (CSV)
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setIsCreateModalOpen(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> Yeni Təchizatçı
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-3 text-bh-gray-400" />
              <input
                type="text"
                placeholder="Təchizatçı adı, VÖEN, əlaqədar şəxs..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900 text-bh-black-900 dark:text-white"
              >
                <option value="all">Bütün Statuslar</option>
                <option value="active">Aktiv</option>
                <option value="suspended">Dayandırılıb</option>
                <option value="pending">Gözləmədə</option>
              </select>

              <select
                value={paymentTerms}
                onChange={(e) => handleTermsChange(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-900 text-bh-black-900 dark:text-white"
              >
                <option value="all">Bütün Ödəniş Şərtləri</option>
                <option value="immediate">Dərhal (0 gün)</option>
                <option value="net15">15 gün sonra</option>
                <option value="net30">30 gün sonra</option>
                <option value="net45">45 gün sonra</option>
                <option value="net60">60 gün sonra</option>
              </select>

              <Button
                variant={onlyWithDebt ? 'default' : 'outline'}
                size="sm"
                onClick={handleToggleDebt}
                className="gap-1 whitespace-nowrap"
              >
                <TrendingDown className="w-3.5 h-3.5" /> Borcu olanlar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-bh-gray-50 dark:bg-bh-black-800 border-b border-bh-gray-200 dark:border-bh-black-700 text-xs uppercase text-bh-gray-500 dark:text-bh-gray-400">
              <tr>
                <th className="py-3 px-4 font-semibold">Təchizatçı Şirkət</th>
                <th className="py-3 px-4 font-semibold">VÖEN</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Əlaqədar Şəxs</th>
                <th className="py-3 px-4 font-semibold">Ödəniş Şərti</th>
                <th className="py-3 px-4 font-semibold text-right">Borc Balansı</th>
                <th className="py-3 px-4 font-semibold">Son Alış</th>
                <th className="py-3 px-4 font-semibold text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-bh-gray-400">
                    Məlumatlar yüklənir...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-bh-gray-400">
                    Axtarışa uyğun təchizatçı tapılmadı.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-bh-gray-50/50 dark:hover:bg-bh-black-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-bh-black-900 dark:text-white flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-bh-gray-400 shrink-0" />
                        <span>{s.name}</span>
                        {s.isDemo && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1 py-0.5 rounded font-mono">
                            DEMO
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-bh-gray-500 dark:text-bh-gray-400 truncate max-w-xs">
                        {s.legalName}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">{s.taxId}</td>
                    <td className="py-3 px-4">{getStatusBadge(s.status)}</td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-bh-black-900 dark:text-white flex items-center gap-1">
                        <User className="w-3 h-3 text-bh-gray-400" />
                        <span>{s.contactPerson}</span>
                      </div>
                      <div className="text-[11px] text-bh-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-bh-gray-400" />
                        <span>{s.phone}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className="font-mono bg-bh-gray-100 dark:bg-bh-black-700 px-1.5 py-0.5 rounded">
                        {s.paymentTerms.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      <span
                        className={
                          s.payableBalance > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-bh-gray-600 dark:text-bh-gray-300'
                        }
                      >
                        {formatMoney(s.payableBalance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-bh-gray-500">
                      {formatDate(s.lastPurchaseDate)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/suppliers/${s.id}`)}
                          className="h-8 px-2 text-xs gap-1"
                        >
                          Kart <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Create Supplier */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Təchizatçı Qeydiyyatı"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {duplicateCheck.hasDuplicate && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-md flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Təkrar Qeydiyyat Xəbərdarlığı:</strong>
                <p>{duplicateCheck.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Təchizatçı Adı *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
                placeholder="məs. Baku Fashion Textile MMC"
              />
              {formErrors.name && (
                <span className="text-[11px] text-rose-500">{formErrors.name}</span>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                VÖEN (10 Rəqəm) *
              </label>
              <input
                type="text"
                required
                maxLength={10}
                value={formData.taxId}
                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm font-mono dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
                placeholder="1401234567"
              />
              {formErrors.taxId && (
                <span className="text-[11px] text-rose-500">{formErrors.taxId}</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
              Tam Hüquqi Adı *
            </label>
            <input
              type="text"
              required
              value={formData.legalName}
              onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
              className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
              placeholder="Baku Fashion Textile Məhdud Məsuliyyətli Cəmiyyəti"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Məsul Şəxs *
              </label>
              <input
                type="text"
                required
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
                placeholder="Fuad Məmmədov"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Telefon *
              </label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
                placeholder="+994 12 440 22 11"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                E-poçt *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
                placeholder="info@bakufashion.az"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Ödəniş Şərti
              </label>
              <select
                value={formData.paymentTerms}
                onChange={(e) =>
                  setFormData({ ...formData, paymentTerms: e.target.value as PaymentTerms })
                }
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
              >
                <option value="immediate">Dərhal (0 gün)</option>
                <option value="net15">15 gün sonra</option>
                <option value="net30">30 gün sonra</option>
                <option value="net45">45 gün sonra</option>
                <option value="net60">60 gün sonra</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Valyuta
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value as 'AZN' | 'USD' | 'EUR' | 'TRY' })
                }
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
              >
                <option value="AZN">AZN (₼)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="TRY">TRY (₺)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-bh-gray-700 dark:text-bh-gray-300 mb-1">
                Tədarük Müddəti (Gün)
              </label>
              <input
                type="number"
                min={1}
                value={formData.leadTimeDays}
                onChange={(e) =>
                  setFormData({ ...formData, leadTimeDays: Number(e.target.value) })
                }
                className="w-full px-3 py-1.5 border rounded text-sm dark:bg-bh-black-900 border-bh-gray-300 dark:border-bh-black-700"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Ləğv et
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={duplicateCheck.hasDuplicate}
            >
              Yadda saxla (DEMO)
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
