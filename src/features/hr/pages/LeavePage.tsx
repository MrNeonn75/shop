import React, { useEffect, useState } from 'react';
import {
  Clock,
  Plus,
  UserCheck,
  CalendarCheck2,
  Info,
  Sparkles,
} from 'lucide-react';
import { hrRepository } from '../../../shared/adapters';
import { LeaveBalance, LeaveRequest, PublicHoliday, LeaveType } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { calculateWorkingDaysInInterval } from '../utils/leaveEngine';

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Əsas Məzuniyyət (Ödənişli)',
  unpaid: 'Ödənişsiz Məzuniyyət',
  sick: 'Xəstəlik Vərəqəsi',
  maternity: 'Analıq / Sosial Məzuniyyət',
  study: 'Təhsil Məzuniyyəti',
};

export const LeavePage: React.FC = () => {
  const { toast } = useToast();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'balances' | 'holidays'>('requests');
  const [statusFilter, setStatusFilter] = useState('all');

  // New Request Modal
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [newRequestEmployeeId, setNewRequestEmployeeId] = useState('');
  const [newRequestLeaveType, setNewRequestLeaveType] = useState<LeaveType>('annual');
  const [newRequestStartDate, setNewRequestStartDate] = useState('2026-05-04');
  const [newRequestEndDate, setNewRequestEndDate] = useState('2026-05-15');
  const [newRequestReason, setNewRequestReason] = useState('');

  // Approval Modal
  const [decisionTarget, setDecisionTarget] = useState<LeaveRequest | null>(null);
  const [decisionLevel, setDecisionLevel] = useState<'manager' | 'hr'>('manager');
  const [decisionAction, setDecisionAction] = useState<'approved' | 'rejected'>('approved');
  const [decisionNote, setDecisionNote] = useState('');

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    try {
      const [balList, reqList, holList] = await Promise.all([
        hrRepository.getLeaveBalances(),
        hrRepository.getLeaveRequests({
          status: statusFilter === 'all' ? undefined : statusFilter,
        }),
        hrRepository.getPublicHolidays(2026),
      ]);
      setBalances(balList);
      setRequests(reqList);
      setHolidays(holList);
    } catch {
      toast({
        title: 'Xəta',
        description: 'Məzuniyyət məlumatları yüklənərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleOpenDecision = (req: LeaveRequest, level: 'manager' | 'hr', action: 'approved' | 'rejected') => {
    setDecisionTarget(req);
    setDecisionLevel(level);
    setDecisionAction(action);
    setDecisionNote('');
  };

  const handleConfirmDecision = async () => {
    if (!decisionTarget) return;

    try {
      await hrRepository.decideLeaveRequest(
        decisionTarget.id,
        decisionAction,
        decisionLevel,
        decisionLevel === 'manager' ? 'Filial Meneceri' : 'HR Direktoru',
        decisionNote
      );

      toast({
        title: decisionAction === 'approved' ? 'Təsdiqləndi' : 'İmtina edildi',
        description: `${decisionTarget.employeeName} üçün müraciət ${decisionLevel.toUpperCase()} səviyyəsində ${decisionAction === 'approved' ? 'təsdiqləndi' : 'imtina edildi'}`,
      });
      setDecisionTarget(null);
      loadData();
    } catch {
      toast({
        title: 'Xəta',
        description: 'Qərar yadda saxlanılarkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleCreateRequest = async () => {
    if (!newRequestEmployeeId) {
      toast({
        title: 'İşçi seçilməyib',
        description: 'Zəhmət olmasa işçini seçin',
        variant: 'danger',
      });
      return;
    }

    const calculatedDays = calculateWorkingDaysInInterval(
      newRequestStartDate,
      newRequestEndDate,
      holidays
    );

    if (calculatedDays <= 0) {
      toast({
        title: 'Tarix aralığı yanlışdır',
        description: 'Məzuniyyət ən azı 1 iş gününü əhatə etməlidir',
        variant: 'danger',
      });
      return;
    }

    // Check balance for annual leave
    if (newRequestLeaveType === 'annual') {
      const empBal = balances.find((b) => b.employeeId === newRequestEmployeeId);
      if (empBal && empBal.annualRemainingDays < calculatedDays) {
        toast({
          title: 'Məzuniyyət balansı çatmır',
          description: `Qalıq: ${empBal.annualRemainingDays} gün, tələb olunan: ${calculatedDays} gün`,
          variant: 'danger',
        });
        return;
      }
    }

    const empBal = balances.find((b) => b.employeeId === newRequestEmployeeId);

    try {
      await hrRepository.submitLeaveRequest({
        employeeId: newRequestEmployeeId,
        employeeName: empBal ? empBal.employeeName : 'İşçi',
        leaveType: newRequestLeaveType,
        startDate: newRequestStartDate,
        endDate: newRequestEndDate,
        totalDays: calculatedDays,
        reason: newRequestReason,
        branchId: 'branch-1',
        branchName: '28 May Flaman Filialı',
        department: 'Satış',
      });

      toast({
        title: 'Müraciət Göndərildi',
        description: `${calculatedDays} günlük məzuniyyət müraciəti rəhbərliyin təsdiqinə göndərildi`,
      });
      setIsNewRequestModalOpen(false);
      loadData();
    } catch {
      toast({
        title: 'Xəta',
        description: 'Müraciət göndərilərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const selectedEmpBalance = balances.find((b) => b.employeeId === newRequestEmployeeId);
  const calculatedRequestedDays = calculateWorkingDaysInInterval(
    newRequestStartDate,
    newRequestEndDate,
    holidays
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Məzuniyyət İdarəetməsi
          </h1>
          <p className="text-text-secondary text-sm">
            Əməkdaşların məzuniyyət qalıqları, iki-mərhələli təsdiq zənciri və istehsalat təqvimi
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="default"
            onClick={() => setIsNewRequestModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Yeni Məzuniyyət Müraciəti
          </Button>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Gözləmədə Olan Müraciətlər</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">
            {requests.filter((r) => r.status.startsWith('pending')).length}
          </div>
          <p className="text-xs text-text-secondary mt-1">Təsdiq tələb edir</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Aktiv Məzuniyyətdə</span>
            <UserCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-primary">
            {requests.filter((r) => r.status === 'approved').length}
          </div>
          <p className="text-xs text-text-secondary mt-1">Bu ay təsdiqlənmiş</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Orta Məzuniyyət Qalığı</span>
            <CalendarCheck2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            {balances.length > 0
              ? Math.round(
                  balances.reduce((s, b) => s + b.annualRemainingDays, 0) / balances.length
                )
              : 0}{' '}
            gün
          </div>
          <p className="text-xs text-text-secondary mt-1">İşçi başına əsas qalıq</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Qeyri-İş Günləri (2026)</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400">{holidays.length}</div>
          <p className="text-xs text-text-secondary mt-1">Rəsmi bayram günləri</p>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'requests'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Müraciətlər ({requests.length})
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'balances'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Məzuniyyət Qalıqları
        </button>

        <button
          onClick={() => setActiveTab('holidays')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'holidays'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Rəsmi Bayram və İstirahət Təqvimi
        </button>
      </div>

      {/* TAB 1: Requests */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary">Status filteri:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-card border border-border-default rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none"
            >
              <option value="all">Bütün Statuslar</option>
              <option value="pending_manager">Filial Meneceri Gözləyir</option>
              <option value="pending_hr">HR Təsdiqi Gözləyir</option>
              <option value="approved">Təsdiqlənmiş</option>
              <option value="rejected">İmtina Edilmiş</option>
            </select>
          </div>

          <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
                  <tr>
                    <th className="py-3 px-4">İşçi</th>
                    <th className="py-3 px-4">Məzuniyyət Növü</th>
                    <th className="py-3 px-4">Tarix Aralığı</th>
                    <th className="py-3 px-4">İş Günləri</th>
                    <th className="py-3 px-4">Əsaslandırma</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Təsdiq Zənciri</th>
                    <th className="py-3 px-4 text-right">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-text-secondary">
                        Müraciət tapılmadı.
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr key={req.id} className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-text-primary">{req.employeeName}</div>
                          <div className="text-xs text-text-secondary">
                            {req.department} • {req.branchName}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-medium text-text-primary">
                            {LEAVE_TYPE_LABELS[req.leaveType]}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                          {req.startDate} — {req.endDate}
                        </td>
                        <td className="py-3 px-4 font-semibold text-text-primary text-xs">
                          {req.totalDays} gün
                        </td>
                        <td className="py-3 px-4 text-xs text-text-secondary max-w-[200px] truncate">
                          {req.reason}
                        </td>
                        <td className="py-3 px-4">
                          {req.status === 'approved' ? (
                            <Badge variant="success">Təsdiqləndi</Badge>
                          ) : req.status === 'rejected' ? (
                            <Badge variant="danger">İmtina</Badge>
                          ) : req.status === 'pending_manager' ? (
                            <Badge variant="warning">Menecer Təsdiqi</Badge>
                          ) : (
                            <Badge variant="warning">HR Təsdiqi</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-text-secondary">
                          {req.managerApproverName && (
                            <div>Menecer: {req.managerApproverName} ✓</div>
                          )}
                          {req.hrApproverName && <div>HR: {req.hrApproverName} ✓</div>}
                          {!req.managerApproverName && !req.hrApproverName && <span>Gözləmədə</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {req.status === 'pending_manager' && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 px-2 text-emerald-400 border-emerald-500/30"
                                onClick={() => handleOpenDecision(req, 'manager', 'approved')}
                              >
                                Təsdiq
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 px-2 text-rose-400 border-rose-500/30"
                                onClick={() => handleOpenDecision(req, 'manager', 'rejected')}
                              >
                                İmtina
                              </Button>
                            </div>
                          )}

                          {req.status === 'pending_hr' && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="default"
                                size="sm"
                                className="text-xs h-7 px-2"
                                onClick={() => handleOpenDecision(req, 'hr', 'approved')}
                              >
                                HR Təsdiq
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 px-2 text-rose-400 border-rose-500/30"
                                onClick={() => handleOpenDecision(req, 'hr', 'rejected')}
                              >
                                İmtina
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: Balances */}
      {activeTab === 'balances' && (
        <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
                <tr>
                  <th className="py-3 px-4">İşçi</th>
                  <th className="py-3 px-4">İllik Hüquq (gün)</th>
                  <th className="py-3 px-4">İstifadə Edilmiş (gün)</th>
                  <th className="py-3 px-4">Qalıq (gün)</th>
                  <th className="py-3 px-4">Ödənişsiz İstifadə (gün)</th>
                  <th className="py-3 px-4">Xəstəlik (gün)</th>
                  <th className="py-3 px-4 text-right">Son Hesablama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {balances.map((b) => (
                  <tr key={b.employeeId} className="hover:bg-surface-hover/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-text-primary">{b.employeeName}</td>
                    <td className="py-3 px-4 font-mono text-xs">{b.annualEntitledDays} gün</td>
                    <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                      {b.annualUsedDays} gün
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-bold text-emerald-400">
                      {b.annualRemainingDays} gün
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                      {b.unpaidUsedDays} gün
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-text-secondary">
                      {b.sickDaysUsed} gün
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-text-secondary text-right">
                      {b.lastRecalculatedAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: Public Holidays */}
      {activeTab === 'holidays' && (
        <div className="space-y-4">
          <div className="bg-surface-card border border-border-default rounded-xl p-4 flex items-center gap-3">
            <Info className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-xs text-text-secondary leading-relaxed">
              Azərbaycan Respublikasının Əmək Məcəlləsinə əsasən, qeyri-iş günü hesab edilən bayram günləri məzuniyyət müddətinə daxil edilmir və məzuniyyətin əsas günləri hesablanarkən çıxılır.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {holidays.map((h) => (
              <Card key={h.id} className="p-4 bg-surface-card border-border-default flex items-center justify-between">
                <div>
                  <div className="font-semibold text-text-primary text-sm">{h.nameAz}</div>
                  <div className="font-mono text-xs text-text-secondary mt-1">{h.date}</div>
                </div>
                <Badge variant={h.isWorkingDay ? 'outline' : 'danger'}>
                  {h.isWorkingDay ? 'İş günü' : 'Qeyri-iş günü'}
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal: New Leave Request */}
      {isNewRequestModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsNewRequestModalOpen(false)}
          title="Yeni Məzuniyyət Müraciəti"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Əməkdaş Seçin
              </label>
              <select
                value={newRequestEmployeeId}
                onChange={(e) => setNewRequestEmployeeId(e.target.value)}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              >
                <option value="">Seçin...</option>
                {balances.map((b) => (
                  <option key={b.employeeId} value={b.employeeId}>
                    {b.employeeName} (Qalıq: {b.annualRemainingDays} gün)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Məzuniyyət Növü
              </label>
              <select
                value={newRequestLeaveType}
                onChange={(e) => setNewRequestLeaveType(e.target.value as LeaveType)}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              >
                {Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Başlama Tarixi
                </label>
                <input
                  type="date"
                  value={newRequestStartDate}
                  onChange={(e) => setNewRequestStartDate(e.target.value)}
                  className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Bitmə Tarixi
                </label>
                <input
                  type="date"
                  value={newRequestEndDate}
                  onChange={(e) => setNewRequestEndDate(e.target.value)}
                  className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>

            {/* Live Calculation Preview */}
            <div className="p-3 bg-surface-hover/50 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-secondary">Hesablanan İş Günü:</span>
                <span className="font-bold text-text-primary">
                  {calculatedRequestedDays} gün (Bayramlar nəzərə alınıb)
                </span>
              </div>
              {selectedEmpBalance && newRequestLeaveType === 'annual' && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Mövcud Balansdan Çıxılacaq:</span>
                  <span
                    className={`font-bold ${
                      selectedEmpBalance.annualRemainingDays >= calculatedRequestedDays
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {selectedEmpBalance.annualRemainingDays} - {calculatedRequestedDays} ={' '}
                    {selectedEmpBalance.annualRemainingDays - calculatedRequestedDays} gün qalıq
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Əsaslandırma / Qeyd
              </label>
              <textarea
                value={newRequestReason}
                onChange={(e) => setNewRequestReason(e.target.value)}
                placeholder="Məzuniyyət səbəbi haqqında qısa qeyd..."
                rows={3}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsNewRequestModalOpen(false)}>
                Ləğv et
              </Button>
              <Button variant="default" onClick={handleCreateRequest}>
                Müraciəti Təsdiqə Göndər
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Decision Confirm */}
      {decisionTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDecisionTarget(null)}
          title={`Məzuniyyət Qərarı — ${decisionTarget.employeeName}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-text-secondary">
              {decisionTarget.employeeName} üçün {decisionTarget.totalDays} günlük ({decisionTarget.startDate} — {decisionTarget.endDate}) müraciətə {decisionLevel.toUpperCase()} rəyi bildirilir:
            </p>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Qərar Rəyi / İzah
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Təsdiq və ya imtina səbəbini qeyd edin..."
                rows={3}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setDecisionTarget(null)}>
                Geri
              </Button>
              <Button
                variant={decisionAction === 'approved' ? 'default' : 'destructive'}
                onClick={handleConfirmDecision}
              >
                {decisionAction === 'approved' ? 'Rəsmi Təsdiqlə' : 'İmtina Et'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
