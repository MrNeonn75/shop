import React, { useState } from 'react';
import { Employee } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Users } from 'lucide-react';

interface OrgChartViewProps {
  employees: Employee[];
  onSelectEmployee?: (employee: Employee) => void;
}

export const OrgChartView: React.FC<OrgChartViewProps> = ({
  employees,
  onSelectEmployee,
}) => {
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const departments = Array.from(new Set(employees.map((e) => e.department)));
  const branches = Array.from(new Set(employees.map((e) => e.branchName)));

  // Filter employees
  const filtered = employees.filter((e) => {
    if (filterDepartment !== 'all' && e.department !== filterDepartment) return false;
    if (filterBranch !== 'all' && e.branchName !== filterBranch) return false;
    return true;
  });

  // Group by manager
  // Top level: no manager or manager not in list
  const topLevel = filtered.filter(
    (e) => !e.managerId || !employees.some((m) => m.id === e.managerId)
  );

  const getSubordinates = (managerId: string) => {
    return filtered.filter((e) => e.managerId === managerId);
  };

  const renderEmployeeNode = (emp: Employee, depth = 0) => {
    const subordinates = getSubordinates(emp.id);

    return (
      <div key={emp.id} className="relative space-y-2">
        <div
          onClick={() => onSelectEmployee?.(emp)}
          className={`flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary-500 cursor-pointer transition-all shadow-2xs ${
            depth > 0 ? 'ml-6 border-l-4 border-l-primary-500' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
              {emp.firstName[0]}
              {emp.lastName[0]}
            </div>
            <div>
              <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                {emp.fullName}
              </div>
              <div className="text-[11px] text-slate-500">
                {emp.jobTitle} • {emp.department}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="neutral" className="text-[10px]">
              {emp.branchName}
            </Badge>
            {subordinates.length > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Users className="h-3 w-3" />
                {subordinates.length} tabe
              </Badge>
            )}
          </div>
        </div>

        {subordinates.length > 0 && (
          <div className="space-y-2 pl-2 border-l border-slate-200 dark:border-slate-800 ml-4">
            {subordinates.map((sub) => renderEmployeeNode(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Departament:</span>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">Bütün Departamentlər</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Filial:</span>
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">Bütün Filiallar</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tree list */}
      <div className="space-y-3">
        {topLevel.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Seçilmiş filtr üzrə iyerarxiya tapılmadı.
          </div>
        ) : (
          topLevel.map((root) => renderEmployeeNode(root, 0))
        )}
      </div>
    </div>
  );
};

