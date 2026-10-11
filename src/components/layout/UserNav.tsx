import React from 'react';
import { useSessionStore } from '../../shared/stores/sessionStore';
import { Avatar } from '../ui/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { LogOut, ShieldCheck, User } from 'lucide-react';
import { UserRole } from '../../shared/utils/permissions';
import { Badge } from '../ui/Badge';

export const UserNav: React.FC = () => {
  const { user, clearSession, switchRoleForDemo } = useSessionStore();

  if (!user) return null;

  const roles: { id: UserRole; label: string }[] = [
    { id: 'superadmin', label: 'Sistem admini' },
    { id: 'general_manager', label: 'Baş menecer' },
    { id: 'branch_manager', label: 'Filial meneceri' },
    { id: 'cashier', label: 'Kassir' },
    { id: 'warehouse_keeper', label: 'Anbardar' },
    { id: 'accountant', label: 'Mühasib' },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-full p-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
        >
          <Avatar fallbackText={user.name} size="sm" status="online" />
          <div className="hidden md:flex flex-col text-left leading-tight">
            <span className="text-xs font-semibold text-foreground">{user.name}</span>
            <span className="text-[10px] text-muted-foreground capitalize">{user.role}</span>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-foreground">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
            <div className="pt-1">
              <Badge variant="neutral" size="sm">
                Rol: {user.role}
              </Badge>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Demo Rolunu Dəyiş:</span>
        </div>
        {roles.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onClick={() => switchRoleForDemo(r.id)}
            className="text-xs justify-between"
          >
            <span>{r.label}</span>
            {user.role === r.id && <span className="text-[10px] text-bh-accent font-bold">✓</span>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <User className="mr-2 h-3.5 w-3.5" />
          <span>Profil</span>
        </DropdownMenuItem>

        <DropdownMenuItem destructive onClick={clearSession}>
          <LogOut className="mr-2 h-3.5 w-3.5" />
          <span>Çıxış</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

