import React, { useEffect, useState } from 'react';
import {
  Users,
  Clock,
  DollarSign,
  Building2,
  Calendar,
} from 'lucide-react';
import { hrRepository } from '../../../shared/adapters';
import { Employee, MonthlyTimesheetItem, LeaveBalance, PayrollPeriod } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { formatMoney } from '../../../shared/utils/formatters';

export const HrReportsPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timesheets, setTimesheets] = useState<MonthlyTimesheetItem[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [empList, tsList, balList, pList] = await Promise.all([
        hrRepository.getEmployees(),
        hrRepository.getMonthlyTimesheets('2026-04'),
        hrRepository.getLeaveBalances(),
        hrRepository.getPayrollPeriods(),
      ]);
      setEmployees(empList);
      setTimesheets(tsList);
      setBalances(balList);
      setPeriods(pList);
    } catch {
      // fallback
    }
  };

  // 1. Department Breakdown
  const deptCounts: Record<string, number> = {};
  employees.forEach((e) => {
    deptCounts[e.department] = (deptCounts[e.department] || 0) + 1;
  });

  // 2. Branch Breakdown
  const branchCounts: Record<string, number> = {};
  employees.forEach((e) => {
    branchCounts[e.branchName] = (branchCounts[e.branchName] || 0) + 1;
  });

  // 3. Attendance & Timesheet aggregates
  const totalWorked = timesheets.reduce((s, t) => s + t.totalWorkedHours, 0);
  const totalOvertime = timesheets.reduce((s, t) => s + t.totalOvertimeHours, 0);
  const totalLateMins = timesheets.reduce((s, t) => s + t.totalLateMinutes, 0);
  const totalAbsences = timesheets.reduce((s, t) => s + t.absenceDays, 0);

  // 4. Leave aggregates
  const totalLeaveEntitled = balances.reduce((s, b) => s + b.annualEntitledDays, 0);
  const totalLeaveUsed = balances.reduce((s, b) => s + b.annualUsedDays, 0);
  const totalLeaveRemaining = balances.reduce((s, b) => s + b.annualRemainingDays, 0);

  // 5. Payroll latest
  const latestPeriod = periods[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          HR və Kadr Hesabatları
        </h1>
        <p className="text-text-secondary text-sm">
          İşçi qüvvəsinin strukturu, davamiyyət intizamı, məzuniyyət istifadəsi və əməkhaqqı analitikası
        </p>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Ştat Sayı (Aktiv)</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">
            {employees.filter((e) => e.status === 'active').length} / {employees.length}
          </div>
          <p className="text-xs text-text-secondary mt-1">Cəmi əməkdaş sayı</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Faktiki İş Saatı (Aprel)</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{totalWorked} saat</div>
          <p className="text-xs text-text-secondary mt-1">+{totalOvertime} saat artıq iş</p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Məzuniyyət İstifadəsi</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400">
            {totalLeaveEntitled > 0
              ? Math.round((totalLeaveUsed / totalLeaveEntitled) * 100)
              : 0}
            %
          </div>
          <p className="text-xs text-text-secondary mt-1">
            {totalLeaveUsed} gün istifadə / {totalLeaveRemaining} qalıq
          </p>
        </Card>

        <Card className="p-4 bg-surface-card border-border-default">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary font-medium">Cari Aylıq Fond</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-400">
            {latestPeriod ? formatMoney(latestPeriod.totalGrossQapik) : '0.00 ₼'}
          </div>
          <p className="text-xs text-text-secondary mt-1">Gross büdcə</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Branch Distribution */}
        <Card className="p-5 bg-surface-card border-border-default space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Filiallar üzrə İşçi Paylanması
            </h3>
            <Badge variant="outline">{Object.keys(branchCounts).length} Filial</Badge>
          </div>

          <div className="space-y-3">
            {Object.entries(branchCounts).map(([bName, count]) => {
              const pct = Math.round((count / (employees.length || 1)) * 100);
              return (
                <div key={bName} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-primary font-medium">{bName}</span>
                    <span className="text-text-secondary font-mono">
                      {count} nəfər ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 2. Department Breakdown */}
        <Card className="p-5 bg-surface-card border-border-default space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Departamentlər üzrə Paylanma
            </h3>
            <Badge variant="outline">{Object.keys(deptCounts).length} Şöbə</Badge>
          </div>

          <div className="space-y-3">
            {Object.entries(deptCounts).map(([dName, count]) => {
              const pct = Math.round((count / (employees.length || 1)) * 100);
              return (
                <div key={dName} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-primary font-medium">{dName}</span>
                    <span className="text-text-secondary font-mono">
                      {count} nəfər ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 3. Attendance Discipline Summary */}
      <Card className="p-5 bg-surface-card border-border-default space-y-4">
        <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          Davamiyyət İntizamı və Vaxt İtkisi Göstəriciləri
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-surface-hover/40 rounded-lg border border-border-default space-y-1">
            <div className="text-xs text-text-secondary">Cəmi Gecikmə Dəqiqələri:</div>
            <div className="text-xl font-bold text-amber-400 font-mono">
              {totalLateMins} dəqiqə
            </div>
            <p className="text-[11px] text-text-secondary">Tolerans həddini aşan ümumi gecikmələr</p>
          </div>

          <div className="p-3 bg-surface-hover/40 rounded-lg border border-border-default space-y-1">
            <div className="text-xs text-text-secondary">Artıq İş Kompensasiyası:</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              {totalOvertime} saat
            </div>
            <p className="text-[11px] text-text-secondary">1.5x / 2.0x əmsal ilə ödəniləcək</p>
          </div>

          <div className="p-3 bg-surface-hover/40 rounded-lg border border-border-default space-y-1">
            <div className="text-xs text-text-secondary">Qayıb (Üzürsüz İtirilmə):</div>
            <div className="text-xl font-bold text-rose-400 font-mono">{totalAbsences} gün</div>
            <p className="text-[11px] text-text-secondary">Əməkhaqqından tam tutulan günlər</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
