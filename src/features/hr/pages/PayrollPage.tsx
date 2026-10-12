import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  Calendar,
  AlertTriangle,
  Lock,
  CheckCircle,
  Download,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { hrRepository } from '../../../shared/adapters';
import { PayrollPeriod, PayrollItem } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { formatMoney } from '../../../shared/utils/formatters';
import { aznToQapik } from '../../../shared/utils/money';
import { MaskedValue } from '../components/MaskedValue';
import { PayslipModal } from '../components/PayslipModal';
import { StatutoryTaxNotice } from '../components/StatutoryTaxNotice';

export const PayrollPage: React.FC = () => {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [currentPeriod, setCurrentPeriod] = useState<PayrollPeriod | null>(null);
  const [items, setItems] = useState<PayrollItem[]>([]);

  // Payslip Modal
  const [payslipItem, setPayslipItem] = useState<PayrollItem | null>(null);

  // Adjustment Modal
  const [adjustmentTarget, setAdjustmentTarget] = useState<PayrollItem | null>(null);
  const [adjAmountAzn, setAdjAmountAzn] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Branch Allocation Preview Modal
  const [isAllocationsModalOpen, setIsAllocationsModalOpen] = useState(false);

  useEffect(() => {
    loadPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriodId) {
      loadPeriodDetails(selectedPeriodId);
    }
  }, [selectedPeriodId]);

  const loadPeriods = async () => {
    try {
      const pList = await hrRepository.getPayrollPeriods();
      setPeriods(pList);
      if (pList.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(pList[0].id);
      }
    } catch {
      toast({
        title: 'Xəta',
        description: 'Əməkhaqqı dövrləri yüklənərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const loadPeriodDetails = async (periodId: string) => {
    try {
      const details = await hrRepository.getPayrollPeriodById(periodId);
      if (details) {
        setCurrentPeriod(details.period);
        setItems(details.items);
      }
    } catch {
      toast({
        title: 'Xəta',
        description: 'Dövr məlumatları yüklənərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleCalculate = async () => {
    if (!currentPeriod) return;
    try {
      const res = await hrRepository.calculatePayrollRun(currentPeriod.id, 'Baş Mühasib');
      setCurrentPeriod(res.period);
      setItems(res.items);
      toast({
        title: 'Maaşlar Hesablandı',
        description: `${res.items.length} işçi üzrə əməkhaqqı və qanuni tutulmalar yenidən hesablandı`,
      });
    } catch {
      toast({
        title: 'Xəta',
        description: 'Hesablama zamanı xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleApprove = async () => {
    if (!currentPeriod) return;
    try {
      const updated = await hrRepository.approvePayrollRun(currentPeriod.id, 'Maliyyə Direktoru');
      setCurrentPeriod(updated);
      toast({
        title: 'Dövr Təsdiqləndi',
        description: 'Əməkhaqqı cədvəli rəhbərlik tərəfindən təsdiqləndi',
      });
    } catch {
      toast({
        title: 'Xəta',
        description: 'Təsdiq zamanı xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleFinalize = async () => {
    if (!currentPeriod) return;
    try {
      const updated = await hrRepository.finalizePayrollRun(currentPeriod.id, 'Baş İcraçı Menecer');
      setCurrentPeriod(updated);
      toast({
        title: 'Dövr Yekunlaşdırıldı və Kilidləndi',
        description: 'Maaş cədvəli kilidləndi. Dəyişikliklər yalnız düzəliş jurnalı ilə aparıla bilər.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Kilidləmə Xətası',
        description: err instanceof Error ? err.message : 'Xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleApplyAdjustment = async () => {
    if (!adjustmentTarget) return;
    const amountVal = parseFloat(adjAmountAzn);
    if (isNaN(amountVal) || amountVal === 0) {
      toast({
        title: 'Məbləğ yanlışdır',
        description: 'Düzəliş məbləğini düzgün qeyd edin (məs: 50 və ya -30)',
        variant: 'danger',
      });
      return;
    }
    if (!adjReason.trim()) {
      toast({
        title: 'Səbəb tələb olunur',
        description: 'Yekunlaşdırılmış maaş üçün düzəliş səbəbi mütləqdir',
        variant: 'danger',
      });
      return;
    }

    try {
      const qapik = aznToQapik(amountVal);
      const updatedItem = await hrRepository.applyPayrollAdjustment(
        adjustmentTarget.id,
        qapik,
        adjReason,
        'Baş Mühasib'
      );

      setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)));
      toast({
        title: 'Düzəliş Tətbiq Edildi',
        description: `${adjustmentTarget.employeeName} üçün ${adjAmountAzn} ₼ düzəliş jurnala əlavə edildi`,
      });
      setAdjustmentTarget(null);
    } catch {
      toast({
        title: 'Xəta',
        description: 'Düzəliş tətbiq edilərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleExportBankCsv = () => {
    if (!items.length) return;
    // Generate Azerbaijani Bank Format: FullName,FIN,IBAN,AmountAZN
    const header = 'Tam Ad,FIN,IBAN,Məbləğ (AZN),Bank';
    const rows = items.map((i) => {
      const azn = (Number(i.netSalaryQapik) / 100).toFixed(2);
      return `"${i.employeeName}","${i.employeeId}","${i.bankIban}",${azn},"${i.bankName}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bank_Maas_Odeme_${currentPeriod?.code || 'run'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    hrRepository.logAuditEntry({
      userId: 'user',
      userName: 'Mühasib',
      action: 'export_payroll',
      details: `${currentPeriod?.name} bank əməkhaqqı faylı CSV formatında ixrac edildi.`,
    });

    toast({
      title: 'Bank Faylı Hazırlandı',
      description: 'CSV faylı uğurla yükləndi və audit jurnalına qeyd edildi',
    });
  };

  const isLocked = currentPeriod?.status === 'finalized' || currentPeriod?.status === 'paid';

  return (
    <div className="space-y-6">
      {/* Statutory Legal Advisory */}
      <StatutoryTaxNotice />

      {/* Header and Period Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Əməkhaqqı Fondu və Hesablaşma
            </h1>
            {isLocked && (
              <Badge variant="warning" className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Kilidli (Yekunlaşdırılıb)
              </Badge>
            )}
          </div>
          <p className="text-text-secondary text-sm">
            Statutar tutulmalar (DSMF, İTS, İşsizlik, Gəlir vergisi), çox-modelli kompensasiya və bank ödənişləri
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period Dropdown */}
          <div className="flex items-center gap-2 bg-surface-card border border-border-default rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-text-secondary" />
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="bg-transparent text-sm text-text-primary focus:outline-none"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAllocationsModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Building2 className="w-4 h-4" />
            Filial Xərc Bölgüsü
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportBankCsv}
            className="flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Bank CSV İxrac
          </Button>
        </div>
      </div>

      {/* Lifecycle Actions Bar */}
      {currentPeriod && (
        <div className="bg-surface-card border border-border-default rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-xs text-text-secondary">Dövr Statusu:</div>
            <Badge
              variant={
                currentPeriod.status === 'finalized'
                  ? 'success'
                  : currentPeriod.status === 'approved'
                  ? 'default'
                  : 'warning'
              }
            >
              {currentPeriod.status.toUpperCase()}
            </Badge>

            {currentPeriod.anomaliesCount > 0 && (
              <Badge variant="danger" className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {currentPeriod.anomaliesCount} Anomaliya Aşkarlandı
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isLocked && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCalculate}
                  className="text-xs"
                >
                  Yenidən Hesabla
                </Button>

                {currentPeriod.status === 'calculated' && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleApprove}
                    className="text-xs"
                  >
                    Rəhbərlik Təsdiqi
                  </Button>
                )}

                {currentPeriod.status === 'approved' && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleFinalize}
                    className="text-xs flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Yekunlaşdır və Kilidlə
                  </Button>
                )}
              </>
            )}

            {isLocked && (
              <span className="text-xs text-text-secondary italic">
                Bu dövr yekunlaşdırılıb və dəyişikliklərə qarşı kilidlənib.
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI Totals */}
      {currentPeriod && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-surface-card border-border-default">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary font-medium">Ümumi Hesablanmış (Gross)</span>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <div className="mt-2 text-xl font-bold text-text-primary">
              <MaskedValue
                value={formatMoney(currentPeriod.totalGrossQapik)}
                requiredPermission="hr.salary.view"
                targetEmployeeName="Əməkhaqqı Fondu"
                auditAction="reveal_salary"
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">{currentPeriod.totalEmployees} əməkdaş</p>
          </Card>

          <Card className="p-4 bg-surface-card border-border-default">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary font-medium">İşçi Tutulmaları (Vergilər)</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-amber-400">
              <MaskedValue
                value={formatMoney(currentPeriod.totalDeductionsQapik)}
                requiredPermission="hr.salary.view"
                targetEmployeeName="Vergi Tutulmaları"
                auditAction="reveal_salary"
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">DSMF, İTS, İşsizlik, Gəlir vergisi</p>
          </Card>

          <Card className="p-4 bg-surface-card border-border-default">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary font-medium">Xalis Ödəniləcək (Net)</span>
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-400">
              <MaskedValue
                value={formatMoney(currentPeriod.totalNetQapik)}
                requiredPermission="hr.salary.view"
                targetEmployeeName="Xalis Ödəniş Fondu"
                auditAction="reveal_salary"
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">Karta köçürüləcək məbləğ</p>
          </Card>

          <Card className="p-4 bg-surface-card border-border-default">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary font-medium">İşəgötürənin Cəmi Xərci</span>
              <Building2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 text-xl font-bold text-purple-400">
              <MaskedValue
                value={formatMoney(currentPeriod.totalEmployerCostQapik)}
                requiredPermission="hr.salary.view"
                targetEmployeeName="İşəgötürən Xərci"
                auditAction="reveal_salary"
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">Gross + İşəgötürən DSMF/İTS</p>
          </Card>
        </div>
      )}

      {/* Items Table */}
      <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
              <tr>
                <th className="py-3 px-4">İşçi</th>
                <th className="py-3 px-4">Filial / Şöbə</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4">İş Saatı</th>
                <th className="py-3 px-4">Gross (Hesablanan)</th>
                <th className="py-3 px-4">Tutulmalar</th>
                <th className="py-3 px-4">Xalis Maaş (Net)</th>
                <th className="py-3 px-4">Status / Siqnal</th>
                <th className="py-3 px-4 text-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-text-secondary">
                    Bu dövr üçün maaş sətirləri tapılmadı. Zəhmət olmasa "Hesabla" düyməsinə basın.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-surface-hover/30 transition-colors ${
                      item.isAnomalous ? 'bg-rose-500/5' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-text-primary">{item.employeeName}</div>
                      <div className="text-xs text-text-secondary font-mono">{item.bankName}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-text-secondary">
                      <div>{item.branchName}</div>
                      <div className="text-[11px]">{item.jobTitle}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {item.compensationModel}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">
                      <div>Fakt: {item.actualWorkedHours} saat</div>
                      {item.overtimeHours > 0 && (
                        <div className="text-emerald-400">+{item.overtimeHours} s. artıq</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <MaskedValue
                        value={formatMoney(item.grossSalaryQapik)}
                        requiredPermission="hr.salary.view"
                        targetEmployeeName={item.employeeName}
                        targetEmployeeId={item.employeeId}
                        auditAction="reveal_salary"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-amber-400">
                      <MaskedValue
                        value={formatMoney(item.totalDeductionsQapik)}
                        requiredPermission="hr.salary.view"
                        targetEmployeeName={item.employeeName}
                        targetEmployeeId={item.employeeId}
                        auditAction="reveal_salary"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-400">
                      <MaskedValue
                        value={formatMoney(item.netSalaryQapik)}
                        requiredPermission="hr.salary.view"
                        targetEmployeeName={item.employeeName}
                        targetEmployeeId={item.employeeId}
                        auditAction="reveal_salary"
                      />
                      {item.adjustments.length > 0 && (
                        <div className="text-[10px] text-primary">
                          ({item.adjustments.length} düzəliş)
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {item.isAnomalous ? (
                        <Badge
                          variant="danger"
                          className="text-[10px] py-0.5 cursor-help"
                          title={item.anomalyReason}
                        >
                          Anomaliya
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px] py-0.5">
                          Normal
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPayslipItem(item)}
                          className="text-xs h-7 px-2"
                        >
                          Qəbz (Payslip)
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustmentTarget(item);
                            setAdjAmountAzn('');
                            setAdjReason('');
                          }}
                          className="text-xs h-7 px-2 text-text-secondary"
                        >
                          Düzəliş
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

      {/* Modal: Payslip */}
      {payslipItem && (
        <PayslipModal
          item={payslipItem}
          periodName={currentPeriod?.name || 'Maaş Dövrü'}
          isOpen={true}
          onClose={() => setPayslipItem(null)}
        />
      )}

      {/* Modal: Post-Finalization Adjustment */}
      {adjustmentTarget && (
        <Modal
          isOpen={true}
          onClose={() => setAdjustmentTarget(null)}
          title={`Əməkhaqqı Düzəlişi — ${adjustmentTarget.employeeName}`}
        >
          <div className="space-y-4">
            <div className="bg-surface-hover/50 p-3 rounded-lg text-xs space-y-1">
              <p className="text-text-secondary">
                Kilidli dövrlər üçün birbaşa kök maaşı dəyişmək qadağandır. Düzəliş jurnala əlavə olunur və auditdə arxivlənir.
              </p>
              <p className="font-semibold text-text-primary">
                Cari Xalis Maaş: {formatMoney(adjustmentTarget.netSalaryQapik)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Düzəliş Məbləği (AZN, mənfi və ya müsbət)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="+50 və ya -25.50"
                value={adjAmountAzn}
                onChange={(e) => setAdjAmountAzn(e.target.value)}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Düzəlişin Səbəbi <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Məsələn: Ötən aydan unudulmuş gecə növbəsi kompensasiyası"
                rows={3}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setAdjustmentTarget(null)}>
                Ləğv et
              </Button>
              <Button variant="default" onClick={handleApplyAdjustment}>
                Düzəlişi Tətbiq Et
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Branch Cost Allocation (Feeds Finance OPEX) */}
      {isAllocationsModalOpen && currentPeriod && (
        <Modal
          isOpen={true}
          onClose={() => setIsAllocationsModalOpen(false)}
          title={`Filiallar üzrə Əməkhaqqı Xərc Bölgüsü — ${currentPeriod.name}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              Aşağıdakı bölgü BRAND HOUSE Maliyyə modulunun Əməliyyat Xərcləri (OPEX) bölməsinə avtomatik inteqrasiya olunur:
            </p>

            <div className="space-y-3">
              {currentPeriod.branchAllocations.map((alloc) => (
                <div
                  key={alloc.branchId}
                  className="bg-surface-card border border-border-default rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary text-sm">
                      {alloc.branchName}
                    </span>
                    <Badge variant="outline">{alloc.employeeCount} əməkdaş</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-border-default">
                    <div>
                      <div className="text-text-secondary">Hesablanan Gross:</div>
                      <div className="font-mono font-medium text-text-primary">
                        {formatMoney(alloc.grossSalaryQapik)}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-secondary">İşəgötürən Vergisi:</div>
                      <div className="font-mono font-medium text-text-primary">
                        {formatMoney(alloc.employerCostQapik)}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-secondary">Cəmi Xərc (OPEX):</div>
                      <div className="font-mono font-bold text-primary">
                        {formatMoney(alloc.totalExpenseQapik)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="default" onClick={() => setIsAllocationsModalOpen(false)}>
                Bağla
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
