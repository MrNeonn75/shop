import React from 'react';
import { usePermission } from '../../shared/hooks/usePermission';
import { PermissionString } from '../../shared/utils/permissions';
import { cn } from '../../shared/utils/cn';
import { Lock } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface SensitiveFieldProps {
  value: React.ReactNode;
  permission: PermissionString;
  mask?: string;
  className?: string;
  tooltipText?: string;
}

/**
 * SensitiveField masks sensitive values (cost price, salary, supplier purchase price)
 * when the active user lacks the required permission.
 *
 * NOTE: This is purely for UX. In production, the backend API omits or masks these fields
 * in HTTP responses to unauthorized roles.
 */
export const SensitiveField: React.FC<SensitiveFieldProps> = ({
  value,
  permission,
  mask = '*** ₼',
  className,
  tooltipText = 'Bu həssas məlumatı görmək üçün icazəniz yoxdur',
}) => {
  const { can } = usePermission();
  const allowed = can(permission);

  if (allowed) {
    return <span className={className}>{value}</span>;
  }

  return (
    <Tooltip content={tooltipText} side="top">
      <span
        className={cn(
          'inline-flex items-center gap-1 font-mono text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded cursor-not-allowed select-none border border-dashed border-border',
          className
        )}
        aria-label="Gizlədilmiş həssas məlumat"
      >
        <Lock className="h-3 w-3 text-muted-foreground/70" />
        <span>{mask}</span>
      </span>
    </Tooltip>
  );
};

