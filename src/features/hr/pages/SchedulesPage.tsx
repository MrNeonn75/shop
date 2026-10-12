import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Send,
  Plus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { hrRepository, branchRepository } from '../../../shared/adapters';
import {
  ShiftTemplate,
  ShiftScheduleWeek,
  ScheduledShift,
  Employee,
  ShiftConflict,
} from '../types';
import { detectShiftConflicts } from '../utils/shiftConflictDetector';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/useToast';

export const SchedulesPage: React.FC = () => {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('branch-1');
  const [currentWeekStart, setCurrentWeekStart] = useState('2026-04-06'); // Monday

  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [schedule, setSchedule] = useState<ShiftScheduleWeek | null>(null);
  const [branchEmployees, setBranchEmployees] = useState<Employee[]>([]);
  const [conflicts, setConflicts] = useState<ShiftConflict[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Assign Shift Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignDate, setAssignDate] = useState('2026-04-06');
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [assignTemplateId, setAssignTemplateId] = useState('tmpl-morning');

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      loadWeekData();
    }
  }, [selectedBranchId, currentWeekStart]);

  async function loadBranches() {
    try {
      const brList = await branchRepository.getBranches();
      setBranches(brList.map((b) => ({ id: b.id, name: b.name })));
    } catch (err) {
      console.error(err);
    }
  }

  async function loadWeekData() {
    setIsLoading(true);
    try {
      const [tmpls, sched, emps] = await Promise.all([
        hrRepository.getShiftTemplates(),
        hrRepository.getShiftSchedule(selectedBranchId, currentWeekStart),
        hrRepository.getEmployees({ branchId: selectedBranchId, status: 'active' }),
      ]);

      setTemplates(tmpls);
      setSchedule(sched);
      setBranchEmployees(emps);
      if (emps.length > 0 && !assignEmployeeId) {
        setAssignEmployeeId(emps[0].id);
      }

      // Check conflicts
      const detected = detectShiftConflicts(sched.shifts, {
        maxWeeklyHours: 40,
        requiredStaffPerHour: sched.requiredStaffPerHour,
      });
      setConflicts(detected);
    } catch (err) {
      toast({
        title: 'Qrafik yüklənmədi',
        description: err instanceof Error ? err.message : 'Xəta baş verdi',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule || !assignEmployeeId || !assignTemplateId) return;

    const emp = branchEmployees.find((e) => e.id === assignEmployeeId);
    const tmpl = templates.find((t) => t.id === assignTemplateId);
    if (!emp || !tmpl) return;

    const newShift: ScheduledShift = {
      id: `s-${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      date: assignDate,
      templateId: tmpl.id,
      templateName: tmpl.name,
      startTime: tmpl.startTime,
      endTime: tmpl.endTime,
      hours: tmpl.durationHours,
    };

    const updatedShifts = [...schedule.shifts, newShift];
    const updatedSchedule: ShiftScheduleWeek = {
      ...schedule,
      shifts: updatedShifts,
      isPublished: false, // Modifications invalidate publish
    };

    try {
      await hrRepository.saveShiftSchedule(updatedSchedule);
      setSchedule(updatedSchedule);

      const detected = detectShiftConflicts(updatedShifts, {
        maxWeeklyHours: 40,
        requiredStaffPerHour: schedule.requiredStaffPerHour,
      });
      setConflicts(detected);

      toast({
        title: 'Növbə Təyin Edildi',
        description: `${emp.fullName} üçün ${assignDate} tarixinə ${tmpl.name} əlavə edildi.`,
        variant: 'success',
      });
      setIsAssignModalOpen(false);
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Yadda saxlanılmadı',
        variant: 'danger',
      });
    }
  };

  const handleCopyPreviousWeek = async () => {
    try {
      const copied = await hrRepository.copyPreviousWeekSchedule(selectedBranchId, currentWeekStart);
      setSchedule(copied);

      const detected = detectShiftConflicts(copied.shifts, {
        maxWeeklyHours: 40,
        requiredStaffPerHour: copied.requiredStaffPerHour,
      });
      setConflicts(detected);

      toast({
        title: 'Əvvəlki Həftə Kopyalandı',
        description: 'Ötən həftənin növbə bölgüsü cari həftəyə köçürüldü.',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Kopyalanmadı',
        variant: 'danger',
      });
    }
  };

  const handlePublish = async () => {
    if (!schedule) return;
    try {
      const published = await hrRepository.publishShiftSchedule(schedule.id, 'Filial Meneceri');
      setSchedule(published);
      toast({
        title: 'Qrafik Dərc Edildi',
        description: 'İş qrafiki rəsmi olaraq təsdiqləndi və əməkdaşların şəxsi kabinetlərinə göndərildi.',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'Xəta',
        description: err instanceof Error ? err.message : 'Dərc olunmadı',
        variant: 'danger',
      });
    }
  };

  // Generate 7 days of the week starting from currentWeekStart
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayNames = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'];
    return {
      dateStr,
      dayName: dayNames[d.getDay()],
    };
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            İş Qrafikləri və Növbə Planlayıcısı (Shift Planner) {isLoading && <span className="text-xs font-normal text-slate-400">(Yüklənir...)</span>}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Filiallar üzrə həftəlik növbə təyinatı, əhatə dairəsi tələbləri və münaqişələrin avtomatik auditi
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPreviousWeek}
            className="gap-1.5 text-xs"
          >
            <Copy className="h-4 w-4" />
            Əvvəlki Həftədən Kopyala
          </Button>

          <Button
            size="sm"
            onClick={handlePublish}
            disabled={schedule?.isPublished}
            className="gap-1.5 text-xs"
          >
            <Send className="h-4 w-4" />
            {schedule?.isPublished ? 'Qrafik Dərc Edilib' : 'Qrafiki Dərc Et'}
          </Button>
        </div>
      </div>

      {/* Top Filter & Week Navigator */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-500 uppercase">Filial:</label>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="rounded-md border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              const d = new Date(currentWeekStart);
              d.setDate(d.getDate() - 7);
              setCurrentWeekStart(d.toISOString().slice(0, 10));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Həftə: {currentWeekStart} &mdash; {schedule?.weekEndDate}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              const d = new Date(currentWeekStart);
              d.setDate(d.getDate() + 7);
              setCurrentWeekStart(d.toISOString().slice(0, 10));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {schedule?.isPublished ? (
            <Badge variant="success" className="gap-1 text-[11px]">
              <CheckCircle2 className="h-3 w-3" />
              Dərc Edilib
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[11px]">
              Qaralama (Dərc edilməyib)
            </Badge>
          )}
        </div>
      </Card>

      {/* Conflicts Alert Banner */}
      {conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Növbə Planında {conflicts.length} Münaqişə və ya Uyğunsuzluq Aşkarlanıb:
          </div>
          <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
            {conflicts.map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Weekly Planner Grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="p-3 w-48 font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                  Əməkdaş ({branchEmployees.length})
                </th>
                {weekDays.map((wd) => (
                  <th
                    key={wd.dateStr}
                    className="p-3 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0"
                  >
                    <div className="font-bold text-slate-900 dark:text-slate-100">{wd.dayName}</div>
                    <div className="text-[11px] text-slate-400">{wd.dateStr.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {branchEmployees.map((emp) => {
                const empShifts = schedule?.shifts.filter((s) => s.employeeId === emp.id) || [];
                const totalHours = empShifts.reduce((s, sh) => s + sh.hours, 0);

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="p-3 border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {emp.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {emp.jobTitle} • Cəmi: <span className="font-mono font-bold">{totalHours}s</span>
                      </div>
                    </td>

                    {weekDays.map((wd) => {
                      const dayShift = empShifts.find((s) => s.date === wd.dateStr);

                      return (
                        <td
                          key={wd.dateStr}
                          className="p-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 text-center align-middle"
                        >
                          {dayShift ? (
                            <div className="p-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 space-y-0.5">
                              <span className="font-bold text-[11px] block">{dayShift.templateName}</span>
                              <span className="font-mono text-[10px] text-slate-500 block">
                                {dayShift.startTime}–{dayShift.endTime}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setAssignDate(wd.dateStr);
                                setAssignEmployeeId(emp.id);
                                setIsAssignModalOpen(true);
                              }}
                              className="w-full py-3 rounded-md border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 hover:text-primary-600 hover:border-primary-400 transition-colors flex items-center justify-center"
                              title="Növbə təyin et"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Assign Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Növbə Təyinatı"
      >
        <form onSubmit={handleAssignShift} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tarix
            </label>
            <input
              type="date"
              required
              value={assignDate}
              onChange={(e) => setAssignDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Əməkdaş
            </label>
            <select
              value={assignEmployeeId}
              onChange={(e) => setAssignEmployeeId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {branchEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.jobTitle})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Növbə Şablonu
            </label>
            <select
              value={assignTemplateId}
              onChange={(e) => setAssignTemplateId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.startTime}–{t.endTime}, {t.durationHours} saat)
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAssignModalOpen(false)}>
              İmtina
            </Button>
            <Button type="submit">Növbəni Əlavə Et</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

