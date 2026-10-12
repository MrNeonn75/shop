import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Network,
  List,
  ExternalLink,
  UserX,
} from 'lucide-react';
import { hrRepository, branchRepository } from '../../../shared/adapters';
import { Employee, EmployeeStatus, CompensationModel } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { formatDate } from '../../../shared/utils/formatters';
import { MaskedValue } from '../components/MaskedValue';
import { OrgChartView } from '../components/OrgChartView';
import { OffboardingModal } from '../components/OffboardingModal';
import { aznToQapik } from '../../../shared/utils/money';

export const EmployeesPage: React.FC = () => {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'org_chart'>('list');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [offboardTarget, setOffboardTarget] = useState<Employee | null>(null);

  // Create Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    department: 'Satış',
    branchId: 'branch-1',
    status: 'active' as EmployeeStatus,
    hireDate: new Date().toISOString().slice(0, 10),
    finCode: '',
    idCardNumber: '',
    birthDate: '1996-05-15',
    gender: 'female' as const,
    phone: '',
    email: '',
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    employmentType: 'full_time' as const,
    contractType: 'unlimited' as const,
    contractNumber: '',
    contractStartDate: new Date().toISOString().slice(0, 10),
    workingHoursPerWeek: 40,
    compensationModel: 'fixed_monthly' as CompensationModel,
    baseSalaryAzn: '1200',
    hourlyRateAzn: '0',
    bankName: 'Kapital Bank ASC',
    bankIban: 'AZ44AIIB380100194400012345670099',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [search, selectedBranch, selectedDepartment, selectedStatus]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [empList, brList] = await Promise.all([
        hrRepository.getEmployees({
          search,
          branchId: selectedBranch,
          department: selectedDepartment,
          status: selectedStatus,
        }),
        branchRepository.getBranches(),
      ]);
      setEmployees(empList);
      setBranches(brList.map((b) => ({ id: b.id, name: b.name })));
    } catch (err) {
      toast({
        title: 'Məlumat yüklənmədi',
        description: err instanceof Error ? err.message : 'Xəta baş verdi',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.jobTitle) {
      toast({ title: 'Xəta', description: 'Bütün vacib sahələri doldurun.', variant: 'danger' });
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedBr = branches.find((b) => b.id === formData.branchId);
      await hrRepository.createEmployee({
        ...formData,
        branchName: selectedBr?.name || '28 May Flaman Filialı',
        salaryConfig: {
          compensationModel: formData.compensationModel,
          baseSalaryQapik: aznToQapik(Number(formData.baseSalaryAzn) || 0),
          hourlyRateQapik: aznToQapik(Number(formData.hourlyRateAzn) || 0),
          overtimeAllowed: true,
          bankName: formData.bankName,
          bankIban: formData.bankIban,
        },
      });

      toast({
        title: 'Əməkdaş Əlavə Edildi',
        description: `${formData.firstName} ${formData.lastName} uğurla qeydiyyata alındı.`,
        variant: 'success',
      });

      setIsCreateModalOpen(false);
      await loadData();
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Qeydiyyat alınmadı',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmOffboarding = async (data: {
    terminationDate: string;
    terminationReason: string;
    checklist: {
      assetsReturned: boolean;
      keysReturned: boolean;
      uniformReturned: boolean;
      accessRevoked: boolean;
      finalSettlementCalculated: boolean;
      notes?: string;
    };
  }) => {
    if (!offboardTarget) return;
    try {
      await hrRepository.offboardEmployee(
        offboardTarget.id,
        data.terminationDate,
        data.terminationReason,
        data.checklist
      );

      toast({
        title: 'İşdən Azad Edildi',
        description: `${offboardTarget.fullName} üçün offboarding tamamlandı və sistem girişləri ləğv edildi.`,
        variant: 'success',
      });

      await loadData();
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Əməliyyat baş tutmadı.',
        variant: 'danger',
      });
    }
  };

  const departments = ['Satış', 'Kassa', 'Logistika və Anbar', 'Rəhbərlik', 'Maliyyə', 'Marketinq'];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Əməkdaşlar Kataloqu və Heyət İdarəetməsi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ştat cədvəli, fərdi profillər, filial təyinatları və məxfiliklə qorunan şəxsi məlumatlar
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-900">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Siyahı
            </button>
            <button
              onClick={() => setViewMode('org_chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'org_chart'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              İyerarxiya (Org Chart)
            </button>
          </div>

          <Button size="sm" onClick={() => setIsCreateModalOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Yeni Əməkdaş
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad, soyad, vəzifə, kod və ya telefon..."
              className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-primary-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">Bütün Filiallar</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">Bütün Departamentlər</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">Bütün Statuslar</option>
              <option value="active">Aktiv</option>
              <option value="on_leave">Məzuniyyətdə</option>
              <option value="suspended">Dayandırılıb</option>
              <option value="terminated">Ayrılıb (Offboarded)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Content: List or Org Chart */}
      {viewMode === 'org_chart' ? (
        <OrgChartView employees={employees} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Əməkdaş</th>
                  <th className="px-4 py-3">Kod & FİN</th>
                  <th className="px-4 py-3">Vəzifə & Şöbə</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3">Rəhbər</th>
                  <th className="px-4 py-3">Əlaqə</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Məlumatlar yüklənir...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Heç bir əməkdaş tapılmadı.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                            {emp.firstName[0]}
                            {emp.lastName[0]}
                          </div>
                          <div>
                            <Link
                              to={`/hr/employees/${emp.id}`}
                              className="font-semibold text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              {emp.fullName}
                            </Link>
                            <div className="text-[11px] text-slate-400">
                              İşə qəbul: {formatDate(emp.hireDate)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                          {emp.employeeCode}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          FİN: <MaskedValue value={emp.finCode} type="fin" />
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {emp.jobTitle}
                        </div>
                        <div className="text-[11px] text-slate-500">{emp.department}</div>
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {emp.branchName}
                      </td>

                      <td className="px-4 py-3 text-slate-500">
                        {emp.managerName || '—'}
                      </td>

                      <td className="px-4 py-3">
                        <div>
                          <MaskedValue value={emp.phone} type="phone" />
                        </div>
                        <div className="text-[11px] text-slate-400">{emp.email}</div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            emp.status === 'active'
                              ? 'success'
                              : emp.status === 'on_leave'
                              ? 'warning'
                              : emp.status === 'terminated'
                              ? 'danger'
                              : 'neutral'
                          }
                          className="capitalize text-[11px]"
                        >
                          {emp.status === 'active'
                            ? 'Aktiv'
                            : emp.status === 'on_leave'
                            ? 'Məzuniyyətdə'
                            : emp.status === 'terminated'
                            ? 'Ayrılıb'
                            : 'Dayandırılıb'}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/hr/employees/${emp.id}`}>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                              <ExternalLink className="h-3 w-3" />
                              Kart
                            </Button>
                          </Link>
                          {emp.status !== 'terminated' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOffboardTarget(emp)}
                              className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                              title="İşdən azad etmə (Offboarding)"
                            >
                              <UserX className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Employee Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Yeni Əməkdaş Qeydiyyatı"
        className="max-w-3xl"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-2.5 text-xs text-blue-800 dark:text-blue-300">
            Fərdi məlumatların minimal toplanması prinsipi: Yalnız əmək müqaviləsi və qanunvericilik üçün tələb olunan zəruri rekvizitləri daxil edin.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ad <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Məsələn: Leyla"
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Soyad <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Məsələn: Məmmədova"
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Vəzifə <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.jobTitle}
                onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                placeholder="Məsələn: Filial Meneceri"
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Departament
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Filial
              </label>
              <select
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                İşə Qəbul Tarixi
              </label>
              <input
                type="date"
                required
                value={formData.hireDate}
                onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Personal & Privacy Fields */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase block mb-2">
              Fərdi və Əlaqə Məlumatları (Məxfilik ilə qorunur)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  FİN Kod (7 simvol)
                </label>
                <input
                  type="text"
                  maxLength={7}
                  required
                  value={formData.finCode}
                  onChange={(e) => setFormData({ ...formData, finCode: e.target.value.toUpperCase() })}
                  placeholder="5ABC123"
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-mono uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ş/V Nömrəsi
                </label>
                <input
                  type="text"
                  required
                  value={formData.idCardNumber}
                  onChange={(e) => setFormData({ ...formData, idCardNumber: e.target.value })}
                  placeholder="AZE12345678"
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telefon
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+994 50 123 45 67"
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  E-poçt
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ad.soyad@brandhouse.az"
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Yaşayış Ünvanı
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Bakı ş., Nəsimi r., Nizami küç."
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Compensation Profile */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase block mb-2">
              Əməkhaqqı və Kompensasiya Modeli
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Model
                </label>
                <select
                  value={formData.compensationModel}
                  onChange={(e) =>
                    setFormData({ ...formData, compensationModel: e.target.value as CompensationModel })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="fixed_monthly">Sabit Aylıq Maaş</option>
                  <option value="hourly">Saatlıq Tarif</option>
                  <option value="commission_based">Satışdan Komissiya</option>
                  <option value="hybrid">Hibrid (Maaş + Bonus)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Baza Maaş (₼ AZN)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.baseSalaryAzn}
                  onChange={(e) => setFormData({ ...formData, baseSalaryAzn: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bank IBAN Hesabı
                </label>
                <input
                  type="text"
                  required
                  value={formData.bankIban}
                  onChange={(e) => setFormData({ ...formData, bankIban: e.target.value })}
                  placeholder="AZ44AIIB..."
                  className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmitting}
            >
              İmtina
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Əməkdaşı Qeydə Al
            </Button>
          </div>
        </form>
      </Modal>

      {/* Offboarding Modal */}
      {offboardTarget && (
        <OffboardingModal
          isOpen={!!offboardTarget}
          onClose={() => setOffboardTarget(null)}
          employee={offboardTarget}
          onConfirm={handleConfirmOffboarding}
        />
      )}
    </div>
  );
};

