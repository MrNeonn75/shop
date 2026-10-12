import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  User,
  ArrowLeft,
  Briefcase,
  FileText,
  DollarSign,
  Key,
  Clock,
  History,
  ShieldCheck,
  Upload,
  Lock,
} from 'lucide-react';
import { hrRepository } from '../../../shared/adapters';
import { Employee } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/useToast';
import { formatMoney, formatDate } from '../../../shared/utils/formatters';
import { MaskedValue } from '../components/MaskedValue';
import { PermissionGate } from '../../../components/ui/PermissionGate';

export const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    | 'personal'
    | 'job'
    | 'contract'
    | 'documents'
    | 'salary'
    | 'system_account'
    | 'attendance_summary'
    | 'history'
  >('personal');

  useEffect(() => {
    if (id) {
      loadEmployee(id);
    }
  }, [id]);

  async function loadEmployee(empId: string) {
    setIsLoading(true);
    try {
      const emp = await hrRepository.getEmployeeById(empId);
      setEmployee(emp);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bh-accent" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Əməkdaş tapılmadı</h2>
        <Link to="/hr" className="text-primary-600 hover:underline text-xs mt-2 inline-block">
          &larr; Əməkdaşlar siyahısına qayıt
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/hr">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {employee.fullName}
              </h1>
              <Badge
                variant={
                  employee.status === 'active'
                    ? 'success'
                    : employee.status === 'on_leave'
                    ? 'warning'
                    : employee.status === 'terminated'
                    ? 'danger'
                    : 'neutral'
                }
              >
                {employee.status === 'active'
                  ? 'Aktiv'
                  : employee.status === 'on_leave'
                  ? 'Məzuniyyətdə'
                  : employee.status === 'terminated'
                  ? 'Ayrılıb'
                  : 'Dayandırılıb'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              {employee.employeeCode} • {employee.jobTitle} • {employee.department} • {employee.branchName}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 sm:gap-4">
        <button
          onClick={() => setActiveTab('personal')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'personal'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <User className="h-4 w-4" />
          Şəxsi Məlumat
        </button>

        <button
          onClick={() => setActiveTab('job')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'job'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          İş Məlumatları
        </button>

        <button
          onClick={() => setActiveTab('contract')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'contract'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          Müqavilə
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'documents'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          Sənədlər ({employee.documents.length})
        </button>

        <button
          onClick={() => setActiveTab('salary')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'salary'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          Əməkhaqqı (Həssas)
        </button>

        <button
          onClick={() => setActiveTab('system_account')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'system_account'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Key className="h-4 w-4" />
          Sistem Hesabı
        </button>

        <button
          onClick={() => setActiveTab('attendance_summary')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'attendance_summary'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="h-4 w-4" />
          Davamiyyət Xülasəsi
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <History className="h-4 w-4" />
          Tarixçə
        </button>
      </div>

      {/* Tab 1: Personal Data */}
      {activeTab === 'personal' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Şəxsi və Əlaqə Məlumatları
            </h3>
            <span className="text-[11px] text-slate-400">
              Fərdi məlumatlar maskalanmış şəkildə saxlanılır
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">FİN Kod:</span>
              <MaskedValue
                value={employee.finCode}
                type="fin"
                employeeId={employee.id}
                employeeName={employee.fullName}
              />
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Ş/V Nömrəsi:</span>
              <MaskedValue
                value={employee.idCardNumber}
                type="id_card"
                employeeId={employee.id}
                employeeName={employee.fullName}
              />
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Doğum Tarixi & Cins:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formatDate(employee.birthDate)} ({employee.gender === 'female' ? 'Qadın' : 'Kişi'})
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Mobil Telefon:</span>
              <MaskedValue
                value={employee.phone}
                type="phone"
                employeeId={employee.id}
                employeeName={employee.fullName}
              />
            </div>

            <div>
              <span className="text-slate-400 block mb-1">E-poçt Ünvanı:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {employee.email}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Faktiki Yaşayış Ünvanı:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {employee.address}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Təcili Əlaqədar Şəxs:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {employee.emergencyContactName}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Təcili Əlaqə Nömrəsi:</span>
              <MaskedValue
                value={employee.emergencyContactPhone}
                type="phone"
                employeeId={employee.id}
                employeeName={employee.fullName}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tab 2: Job Data */}
      {activeTab === 'job' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            İş Məlumatları və Filial Təyinatı
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Vəzifə:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{employee.jobTitle}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Departament:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{employee.department}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Əsas Filial:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{employee.branchName}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Birbaşa Rəhbər (Menecer):</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {employee.managerName || 'Təyin edilməyib'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Məşğulluq Növü:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 uppercase">
                {employee.employmentType.replace('_', ' ')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">İşə Qəbul Tarixi:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formatDate(employee.hireDate)}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 3: Contract */}
      {activeTab === 'contract' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            Əmək Müqaviləsi Rekvizitləri
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Müqavilə Nömrəsi:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {employee.contractNumber}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Müqavilə Növü:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {employee.contractType === 'unlimited' ? 'Müddətsiz' : 'Müddətli'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Başlama Tarixi:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formatDate(employee.contractStartDate)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Həftəlik İş Saatı:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {employee.workingHoursPerWeek} saat / həftə
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 4: Documents */}
      {activeTab === 'documents' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Əməkdaşın Şəxsi Sənədləri və Müddət İzlənməsi
            </h3>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Sənəd Əlavə Et
            </Button>
          </div>

          {employee.documents.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Yüklənmiş sənəd yoxdur.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {employee.documents.map((doc) => (
                <div key={doc.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary-600" />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {doc.fileName} • Yüklənmə: {formatDate(doc.uploadedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {doc.expiryDate && (
                      <Badge variant={doc.isExpired ? 'danger' : 'neutral'} className="text-[10px]">
                        Bitmə tarixi: {formatDate(doc.expiryDate)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab 5: Salary Configuration (Strict Permission) */}
      {activeTab === 'salary' && (
        <PermissionGate
          permission="hr.salary.view"
          fallback={
            <Card className="p-8 text-center space-y-3">
              <Lock className="h-8 w-8 text-slate-400 mx-auto" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Məhdudlaşdırılmış Giriş
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Əməkhaqqı və kompensasiya məlumatlarına yalnız xüsusi səlahiyyətli şəxslər (Baş Menecer, Baş Mühasib) baxa bilər.
              </p>
            </Card>
          }
        >
          <Card className="p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Əməkhaqqı və Kompensasiya Konfiqurasiyası
                </h3>
                <p className="text-[11px] text-slate-500">
                  Hər baxış auditor jurnalında qeydə alınır (Reveal on demand)
                </p>
              </div>
              <Badge variant="outline" className="text-xs uppercase">
                Model: {employee.salaryConfig.compensationModel.replace('_', ' ')}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <span className="text-slate-400 block mb-1">Baza Aylıq Maaş:</span>
                <div className="text-lg font-bold">
                  <MaskedValue
                    value={formatMoney(employee.salaryConfig.baseSalaryQapik)}
                    type="salary"
                    employeeId={employee.id}
                    employeeName={employee.fullName}
                  />
                </div>
              </div>

              {Number(employee.salaryConfig.hourlyRateQapik) > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <span className="text-slate-400 block mb-1">Saatlıq Tarif:</span>
                  <div className="text-lg font-bold">
                    <MaskedValue
                      value={formatMoney(employee.salaryConfig.hourlyRateQapik)}
                      type="salary"
                      employeeId={employee.id}
                      employeeName={employee.fullName}
                    />
                  </div>
                </div>
              )}

              {employee.salaryConfig.commissionRatePercent !== undefined && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <span className="text-slate-400 block mb-1">Satışdan Komissiya:</span>
                  <div className="text-lg font-bold text-emerald-600">
                    {employee.salaryConfig.commissionRatePercent}%
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <span className="text-slate-400 block mb-1">Bank Adı:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {employee.salaryConfig.bankName}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <span className="text-slate-400 block mb-1">Bank IBAN:</span>
                <MaskedValue
                  value={employee.salaryConfig.bankIban}
                  type="iban"
                  employeeId={employee.id}
                  employeeName={employee.fullName}
                />
              </div>
            </div>
          </Card>
        </PermissionGate>
      )}

      {/* Tab 6: System Account */}
      {activeTab === 'system_account' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            ERP İstifadəçi Hesabı ilə Əlaqə
          </h3>
          {employee.systemUserId ? (
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg text-xs text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <span className="font-bold">Əlaqələndirilmiş İstifadəçi: {employee.systemUserId}</span>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Təyin olunmuş sistem rolu: <span className="font-semibold">{employee.systemUserRole}</span> • Status: Aktiv
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Bu əməkdaş üçün ERP istifadəçi hesabı bağlanmayıb.</p>
          )}
        </Card>
      )}

      {/* Tab 7: Attendance Summary */}
      {activeTab === 'attendance_summary' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            Cari Ay Davamiyyət İcmalı
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <span className="text-slate-400 block mb-1">Planlaşdırılmış Saat:</span>
              <span className="text-xl font-bold font-mono">160 saat</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <span className="text-slate-400 block mb-1">Faktiki İşlənmiş:</span>
              <span className="text-xl font-bold font-mono text-blue-600">168 saat</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <span className="text-slate-400 block mb-1">Əlavə İş (Overtime):</span>
              <span className="text-xl font-bold font-mono text-emerald-600">8 saat</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <span className="text-slate-400 block mb-1">Gecikmələr:</span>
              <span className="text-xl font-bold font-mono text-amber-600">28 dəq</span>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 8: History */}
      {activeTab === 'history' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
            Dəyişikliklər və Audit Tarixçəsi
          </h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5" />
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100">İşə qəbul rəsmiləşdirildi</span>
                <p className="text-[11px] text-slate-400">{formatDate(employee.hireDate)} • Əmək müqaviləsi imzalandı</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

