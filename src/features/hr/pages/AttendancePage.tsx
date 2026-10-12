import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Upload,
  UserCheck,
  Building2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { hrRepository, branchRepository } from '../../../shared/adapters';
import { AttendanceRecord, MonthlyTimesheetItem } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';
import { formatMinutesToHoursAndMinutes } from '../utils/attendanceCalculator';

export const AttendancePage: React.FC = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedDate, setSelectedDate] = useState('2026-04-10');
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [timesheets, setTimesheets] = useState<MonthlyTimesheetItem[]>([]);
  const [activeTab, setActiveTab] = useState<'daily' | 'exceptions' | 'timesheet'>('daily');

  // Correction Modal
  const [correctionTarget, setCorrectionTarget] = useState<AttendanceRecord | null>(null);
  const [correctCheckIn, setCorrectCheckIn] = useState('');
  const [correctCheckOut, setCorrectCheckOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // Manual Punch Modal
  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);
  const [punchEmployeeId, setPunchEmployeeId] = useState('');
  const [punchType, setPunchType] = useState<'in' | 'out'>('in');
  const [punchTime, setPunchTime] = useState('09:00');
  const [punchReason, setPunchReason] = useState('');

  // CSV Import Modal
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvContent, setCsvContent] = useState(
    'EMP-001,09:00,18:00\nEMP-002,09:15,18:30\nEMP-003,10:00,19:00'
  );

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadAttendanceData();
  }, [selectedBranch, selectedDate, activeTab]);

  const loadBranches = async () => {
    try {
      const bList = await branchRepository.getBranches();
      setBranches(bList.map((b) => ({ id: b.id, name: b.name })));
    } catch {
      // fallback
    }
  };

  const loadAttendanceData = async () => {
    setIsLoading(true);
    try {
      const recs = await hrRepository.getAttendanceRecords({
        branchId: selectedBranch === 'all' ? undefined : selectedBranch,
        date: selectedDate,
      });
      setRecords(recs);

      if (activeTab === 'timesheet') {
        const monthCode = selectedDate.slice(0, 7); // e.g. "2026-04"
        const ts = await hrRepository.getMonthlyTimesheets(
          monthCode,
          selectedBranch === 'all' ? undefined : selectedBranch
        );
        setTimesheets(ts);
      }
    } catch {
      toast({
        title: 'Xəta',
        description: 'Davamiyyət məlumatları yüklənərkən xəta baş verdi',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCorrection = (record: AttendanceRecord) => {
    setCorrectionTarget(record);
    setCorrectCheckIn(record.checkInTime || '09:00');
    setCorrectCheckOut(record.checkOutTime || '18:00');
    setCorrectionReason('');
  };

  const handleSaveCorrection = async () => {
    if (!correctionTarget) return;
    if (!correctionReason.trim()) {
      toast({
        title: 'Səbəb tələb olunur',
        description: 'Davamiyyət xətası düzəliş edilərkən səbəb qeyd edilməlidir',
        variant: 'danger',
      });
      return;
    }

    try {
      await hrRepository.correctAttendanceException(
        correctionTarget.id,
        correctCheckIn,
        correctCheckOut,
        correctionReason,
        'Admin Menecer'
      );
      toast({
        title: 'Düzəliş qeydə alındı',
        description: `${correctionTarget.employeeName} üçün davamiyyət qeydi yeniləndi`,
      });
      setCorrectionTarget(null);
      loadAttendanceData();
    } catch {
      toast({
        title: 'Xəta',
        description: 'Düzəliş saxlanılarkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleManualPunch = async () => {
    if (!punchEmployeeId) {
      toast({
        title: 'İşçi seçilməyib',
        description: 'Zəhmət olmasa işçini seçin',
        variant: 'danger',
      });
      return;
    }

    try {
      await hrRepository.recordAttendancePunch(
        punchEmployeeId,
        punchType,
        'manual',
        punchTime,
        punchReason || 'Manual qeydiyyat'
      );
      toast({
        title: 'Uğurla qeyd edildi',
        description: 'Davamiyyət qeydi əl ilə sistemə daxil edildi',
      });
      setIsManualPunchOpen(false);
      loadAttendanceData();
    } catch {
      toast({
        title: 'Xəta',
        description: 'Manual qeydiyyat zamanı xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleImportCsv = async () => {
    try {
      const lines = csvContent
        .trim()
        .split('\n')
        .map((line) => {
          const parts = line.split(',');
          return {
            employeeCode: parts[0]?.trim() || '',
            checkIn: parts[1]?.trim() || '09:00',
            checkOut: parts[2]?.trim() || '18:00',
          };
        })
        .filter((l) => l.employeeCode);

      if (lines.length === 0) {
        toast({
          title: 'Format xətası',
          description: 'CSV sətirləri düzgün daxil edilməyib',
          variant: 'danger',
        });
        return;
      }

      const branchId = selectedBranch === 'all' ? 'branch-1' : selectedBranch;
      const res = await hrRepository.importAttendanceCsv(branchId, selectedDate, lines);

      toast({
        title: 'CSV Uğurla idxal edildi',
        description: `${res.importedCount} sətir davamiyyət qeydi bazaya əlavə edildi`,
      });
      setIsCsvModalOpen(false);
      loadAttendanceData();
    } catch {
      toast({
        title: 'İdxal xətası',
        description: 'Fayl oxunarkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  const handleApproveTimesheet = async () => {
    const monthCode = selectedDate.slice(0, 7);
    const branchId = selectedBranch === 'all' ? 'branch-1' : selectedBranch;

    try {
      await hrRepository.approveMonthlyTimesheet(monthCode, branchId, 'Filial Meneceri');
      toast({
        title: 'Tabel Təsdiqləndi',
        description: `${monthCode} dövrü üzrə davamiyyət tabeli təsdiqləndi`,
      });
      loadAttendanceData();
    } catch {
      toast({
        title: 'Xəta',
        description: 'Tabel təsdiqlənərkən xəta baş verdi',
        variant: 'danger',
      });
    }
  };

  // Metrics
  const onTimeCount = records.filter((r) => r.status === 'on_time').length;
  const lateCount = records.filter((r) => r.status === 'late' || r.lateMinutes > 0).length;
  const exceptions = records.filter((r) => r.isException);

  return (
    <div className="space-y-6">
      {/* Top Banner / Biometric Hardware Status */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary text-sm">
                Biometrik Terminal: Konfiqurasiya olunmayıb
              </span>
              <Badge variant="warning">Offline / Manual</Badge>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Fiziki ZKTeco/Hikvision terminalları ilə birbaşa şəbəkə körpüsü qurulmayıb. Giriş-çıxış qeydləri CSV fayl idxalı və ya menecer tərəfindən manual daxil edilir.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            CSV İdxal
          </Button>
          <Button
            size="sm"
            onClick={() => setIsManualPunchOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Clock className="w-4 h-4" />
            Manual Qeydiyyat
          </Button>
        </div>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Davamiyyət və İş Vaxtı {isLoading && <span className="text-xs font-normal text-text-muted">(Yüklənir...)</span>}
          </h1>
          <p className="text-text-secondary text-sm">
            Gündəlik giriş-çıxış qeydləri, gecikmə analitikası, istisna idarəetməsi və aylıq tabel
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Filter */}
          <div className="flex items-center gap-2 bg-surface-card border border-border-default rounded-lg px-3 py-1.5">
            <Building2 className="w-4 h-4 text-text-secondary" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent text-sm text-text-primary focus:outline-none"
            >
              <option value="all">Bütün Filiallar</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-surface-card border border-border-default rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-text-secondary" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm text-text-primary focus:outline-none"
            >
            </input>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Qeydiyyat Sayı</span>
            <UserCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">{records.length}</div>
          <p className="text-xs text-text-secondary mt-1">Günün ümumi qeydləri</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Vaxtında Gələnlər</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{onTimeCount}</div>
          <p className="text-xs text-text-secondary mt-1">Dəqiqlik dərəcəsi</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Gecikmələr</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">{lateCount}</div>
          <p className="text-xs text-text-secondary mt-1">Tolerans həddini aşanlar</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Xətalar / İstisnalar</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-400">{exceptions.length}</div>
          <p className="text-xs text-text-secondary mt-1">Düzəliş tələb edən qeydlər</p>
        </Card>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-border-default pb-2">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'daily'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Gündəlik Lövhə ({records.length})
        </button>

        <button
          onClick={() => setActiveTab('exceptions')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'exceptions'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          İstisnalar Növbəsi
          {exceptions.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-rose-500/20 text-rose-400 font-bold">
              {exceptions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('timesheet')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'timesheet'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Aylıq Tabel (Timesheet)
        </button>
      </div>

      {/* TAB 1: Gündəlik Qeydiyyat Lövhəsi */}
      {activeTab === 'daily' && (
        <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
                <tr>
                  <th className="py-3 px-4">İşçi</th>
                  <th className="py-3 px-4">Filial</th>
                  <th className="py-3 px-4">Cədvəl Saati</th>
                  <th className="py-3 px-4">Giriş</th>
                  <th className="py-3 px-4">Çıxış</th>
                  <th className="py-3 px-4">Gecikmə</th>
                  <th className="py-3 px-4">Artıq İş</th>
                  <th className="py-3 px-4">Faktiki Saat</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-text-secondary">
                      Bu tarix üçün davamiyyət qeydi tapılmadı.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-surface-hover/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-text-primary">{rec.employeeName}</div>
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-xs">{rec.branchName}</td>
                      <td className="py-3 px-4 text-text-secondary text-xs">
                        {rec.scheduledStartTime && rec.scheduledEndTime
                          ? `${rec.scheduledStartTime} - ${rec.scheduledEndTime}`
                          : 'Cədvəlsiz'}
                      </td>
                      <td className="py-3 px-4">
                        {rec.checkInTime ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-text-primary">
                              {rec.checkInTime}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1">
                              {rec.checkInSource === 'manual' ? 'Əl ilə' : 'Cihaz'}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-rose-400 text-xs font-semibold">Qeyd yoxdur</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {rec.checkOutTime ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-text-primary">
                              {rec.checkOutTime}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1">
                              {rec.checkOutSource === 'manual' ? 'Əl ilə' : 'Cihaz'}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-rose-400 text-xs font-semibold">Qeyd yoxdur</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {rec.lateMinutes > 0 ? (
                          <span className="text-amber-400 font-semibold text-xs">
                            +{rec.lateMinutes} dəq
                          </span>
                        ) : (
                          <span className="text-text-secondary text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {rec.overtimeMinutes > 0 ? (
                          <span className="text-emerald-400 font-semibold text-xs">
                            +{formatMinutesToHoursAndMinutes(rec.overtimeMinutes)}
                          </span>
                        ) : (
                          <span className="text-text-secondary text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {formatMinutesToHoursAndMinutes(rec.workedMinutes)}
                      </td>
                      <td className="py-3 px-4">
                        {rec.isException ? (
                          <Badge variant="danger">İstisna</Badge>
                        ) : rec.status === 'on_time' ? (
                          <Badge variant="success">Vaxtında</Badge>
                        ) : rec.status === 'late' ? (
                          <Badge variant="warning">Gecikmə</Badge>
                        ) : rec.status === 'early_leave' ? (
                          <Badge variant="warning">Erkən Çıxış</Badge>
                        ) : (
                          <Badge variant="neutral">{rec.status}</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenCorrection(rec)}
                          className="text-xs"
                        >
                          Düzəliş
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: İstisnalar Növbəsi */}
      {activeTab === 'exceptions' && (
        <div className="space-y-4">
          <div className="bg-surface-card border border-border-default rounded-xl p-4">
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              Giriş/Çıxış Çatışmazlığı və Düzəliş Tələb Edən Qeydlər
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              Bu bölmədə daxil olmayan və ya natamam zərbələr (missing punch) toplanır. Menecer tərəfindən düzəliş edilərkən məcburi əsaslandırma səbəbi qeyd olunur və audit jurnalına yazılır.
            </p>
          </div>

          <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
                  <tr>
                    <th className="py-3 px-4">İşçi</th>
                    <th className="py-3 px-4">Tarix</th>
                    <th className="py-3 px-4">İstisna Səbəbi</th>
                    <th className="py-3 px-4">Mövcud Qeydlər</th>
                    <th className="py-3 px-4 text-right">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {exceptions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-text-secondary">
                        Həll edilməmiş davamiyyət istisnası yoxdur. Əla nəticə!
                      </td>
                    </tr>
                  ) : (
                    exceptions.map((ex) => (
                      <tr key={ex.id} className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-text-primary">{ex.employeeName}</div>
                          <div className="text-xs text-text-secondary">{ex.branchName}</div>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono">{ex.date}</td>
                        <td className="py-3 px-4">
                          <span className="text-rose-400 text-xs font-semibold bg-rose-500/10 px-2 py-1 rounded">
                            {ex.exceptionReason || 'Giriş və ya çıxış qeydi çatışmır'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-text-secondary">
                          Giriş: {ex.checkInTime || 'Yoxdur'} | Çıxış: {ex.checkOutTime || 'Yoxdur'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleOpenCorrection(ex)}
                            className="text-xs"
                          >
                            Düzəliş et və Həll et
                          </Button>
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

      {/* TAB 3: Aylıq Tabel (Timesheet) */}
      {activeTab === 'timesheet' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface-card border border-border-default rounded-xl p-4">
            <div>
              <h3 className="font-semibold text-text-primary text-sm">
                Aylıq İş Vaxtının Uçotu Cədvəli (Forma T-13)
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Filial üzrə əməkdaşların faktiki iş saatları, gecikmələr, artıq iş və məzuniyyət günləri
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleApproveTimesheet}
              className="flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Tabeli Rəsmi Təsdiqlə
            </Button>
          </div>

          <Card className="p-0 overflow-hidden bg-surface-card border-border-default">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-hover/50 text-text-secondary text-xs uppercase border-b border-border-default">
                  <tr>
                    <th className="py-3 px-4">İşçi</th>
                    <th className="py-3 px-4">Vəzifə / Filial</th>
                    <th className="py-3 px-4">Norma Saat</th>
                    <th className="py-3 px-4">Faktiki Saat</th>
                    <th className="py-3 px-4">Gecikmə (dəq)</th>
                    <th className="py-3 px-4">Artıq İş (saat)</th>
                    <th className="py-3 px-4">Qayıb Gün</th>
                    <th className="py-3 px-4">Məzuniyyət Gün</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {timesheets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-text-secondary">
                        Bu ay üçün tabel məlumatı tapılmadı.
                      </td>
                    </tr>
                  ) : (
                    timesheets.map((ts) => (
                      <tr key={ts.employeeId} className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-text-primary">
                          {ts.employeeName}
                        </td>
                        <td className="py-3 px-4 text-xs text-text-secondary">
                          {ts.jobTitle} • {ts.branchName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{ts.totalScheduledHours} saat</td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-text-primary">
                          {ts.totalWorkedHours} saat
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {ts.totalLateMinutes > 0 ? (
                            <span className="text-amber-400 font-semibold">
                              {ts.totalLateMinutes} dəq
                            </span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {ts.totalOvertimeHours > 0 ? (
                            <span className="text-emerald-400 font-semibold">
                              +{ts.totalOvertimeHours} saat
                            </span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {ts.absenceDays > 0 ? (
                            <span className="text-rose-400 font-semibold">{ts.absenceDays} gün</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono">{ts.approvedLeaveDays} gün</td>
                        <td className="py-3 px-4">
                          <Badge variant={ts.status === 'approved' ? 'success' : 'outline'}>
                            {ts.status === 'approved' ? 'Təsdiqlənib' : 'Qaralama'}
                          </Badge>
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

      {/* Modal 1: Correction Modal */}
      {correctionTarget && (
        <Modal
          isOpen={true}
          onClose={() => setCorrectionTarget(null)}
          title={`Davamiyyət İstisnasına Düzəliş — ${correctionTarget.employeeName}`}
        >
          <div className="space-y-4">
            <div className="bg-surface-hover/50 p-3 rounded-lg text-xs space-y-1">
              <div>
                <span className="text-text-secondary">Tarix:</span>{' '}
                <span className="font-mono text-text-primary">{correctionTarget.date}</span>
              </div>
              <div>
                <span className="text-text-secondary">Mövcud Qeyd:</span>{' '}
                <span className="font-mono text-text-primary">
                  {correctionTarget.checkInTime || '--:--'} - {correctionTarget.checkOutTime || '--:--'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Dəqiqləşdirilmiş Giriş Saati
                </label>
                <input
                  type="time"
                  value={correctCheckIn}
                  onChange={(e) => setCorrectCheckIn(e.target.value)}
                  className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Dəqiqləşdirilmiş Çıxış Saati
                </label>
                <input
                  type="time"
                  value={correctCheckOut}
                  onChange={(e) => setCorrectCheckOut(e.target.value)}
                  className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Düzəliş Səbəbi / Əsaslandırma <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Məsələn: İşçi mağazada olub, kart terminalında texniki nasazlıq yaranıb. Şöbə müdirinin imzalı izahatı mövcuddur."
                rows={3}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setCorrectionTarget(null)}>
                Ləğv et
              </Button>
              <Button variant="default" onClick={handleSaveCorrection}>
                Təsdiqlə və Yadda Saxla
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal 2: Manual Punch Modal */}
      {isManualPunchOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsManualPunchOpen(false)}
          title="Manual Giriş/Çıxış Zərbəsi Qeydiyyatı"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">İşçi Seçin</label>
              <select
                value={punchEmployeeId}
                onChange={(e) => setPunchEmployeeId(e.target.value)}
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              >
                <option value="">Seçin...</option>
                {records.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>
                    {r.employeeName} ({r.branchName})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Zərbə Növü</label>
                <select
                  value={punchType}
                  onChange={(e) => setPunchType(e.target.value as 'in' | 'out')}
                  className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                >
                  <option value="in">Giriş (Check-In)</option>
                  <option value="out">Çıxış (Check-Out)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Saat</label>
                <input
                  type="time"
                  value={punchTime}
                  onChange={(e) => setPunchTime(e.target.value)}
                  className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Səbəb</label>
              <input
                type="text"
                value={punchReason}
                onChange={(e) => setPunchReason(e.target.value)}
                placeholder="Ezamiyyət, kart unudulub və s."
                className="w-full bg-surface-card border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsManualPunchOpen(false)}>
                Bağla
              </Button>
              <Button variant="default" onClick={handleManualPunch}>
                Daxil Et
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal 3: CSV Import Modal */}
      {isCsvModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCsvModalOpen(false)}
          title="Terminal CSV Davamiyyət Faylının İdxalı"
        >
          <div className="space-y-4">
            <div className="bg-surface-hover/50 p-3 rounded-lg text-xs space-y-1">
              <p className="font-semibold text-text-primary">Fayl Formatı Təlimatı:</p>
              <p className="text-text-secondary">
                Hər sətirdə: <code className="text-primary">İşçi Kodu, Giriş Saati, Çıxış Saati</code>
              </p>
              <p className="text-text-secondary font-mono">Nümunə: EMP-001,09:00,18:00</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                CSV Sətirləri
              </label>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                rows={6}
                className="w-full font-mono text-xs bg-surface-card border border-border-default rounded-lg p-3 text-text-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsCsvModalOpen(false)}>
                Ləğv et
              </Button>
              <Button variant="default" onClick={handleImportCsv}>
                İdxal Et ({csvContent.trim().split('\n').length} sətir)
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
