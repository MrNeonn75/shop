import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { checkPermissionMatch } from '../../../shared/utils/permissions';
import {
  maskSalary,
  maskFinCode,
  maskPhone,
  maskIban,
  maskIdCard,
  maskEmail,
} from '../utils/masking';
import { hrRepository } from '../../../shared/adapters';
import { HrAuditAction } from '../types';

interface MaskedValueProps {
  value: string;
  type?: 'salary' | 'fin' | 'phone' | 'iban' | 'id_card' | 'email';
  requiredPermission?: string;
  employeeId?: string;
  employeeName?: string;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  auditAction?: HrAuditAction;
  className?: string;
  canToggle?: boolean;
}

export const MaskedValue: React.FC<MaskedValueProps> = ({
  value,
  type = 'salary',
  requiredPermission = 'hr.salary.view',
  employeeId,
  employeeName,
  targetEmployeeId,
  targetEmployeeName,
  auditAction,
  className = '',
  canToggle = true,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const user = useSessionStore((s) => s.user);
  const finalEmpId = targetEmployeeId || employeeId;
  const finalEmpName = targetEmployeeName || employeeName;

  const hasPermission = user
    ? user.role === 'superadmin' ||
      checkPermissionMatch(user.permissions, requiredPermission)
    : false;

  const getMaskedString = () => {
    switch (type) {
      case 'salary':
        return maskSalary(value, isRevealed);
      case 'fin':
        return maskFinCode(value, isRevealed);
      case 'phone':
        return maskPhone(value, isRevealed);
      case 'iban':
        return maskIban(value, isRevealed);
      case 'id_card':
        return maskIdCard(value, isRevealed);
      case 'email':
        return maskEmail(value, isRevealed);
      default:
        return isRevealed ? value : '••••••';
    }
  };

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasPermission) {
      return;
    }

    const nextState = !isRevealed;
    setIsRevealed(nextState);

    // Audit logging for sensitive data unmasking
    if (nextState && user) {
      try {
        await hrRepository.logAuditEntry({
          userId: user.id,
          userName: user.name,
          action: auditAction || (type === 'salary' ? 'reveal_salary' : 'reveal_personal'),
          targetEmployeeId: finalEmpId,
          targetEmployeeName: finalEmpName,
          details: `${user.name} tərəfindən ${type} məlumatı aşkar edildi (Açıldı)`,
        });
      } catch (err) {
        console.error('Failed to log privacy audit:', err);
      }
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono ${className}`}>
      <span>{getMaskedString()}</span>

      {canToggle && hasPermission && (
        <button
          type="button"
          onClick={handleToggle}
          title={isRevealed ? 'Gizlət' : 'Məlumatı göstər (Auditor jurnalına düşəcək)'}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-hidden p-0.5 rounded-sm"
        >
          {isRevealed ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {canToggle && !hasPermission && (
        <span
          title="Baxış hüququ yoxdur (Məhdudlaşdırılıb)"
          className="text-slate-400 cursor-not-allowed"
        >
          <Lock className="h-3 w-3" />
        </span>
      )}
    </span>
  );
};

