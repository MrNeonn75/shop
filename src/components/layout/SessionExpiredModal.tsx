import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertTriangle, LogOut } from 'lucide-react';
import { useSessionStore } from '../../shared/stores/sessionStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export const SessionExpiredModal: React.FC = () => {
  const navigate = useNavigate();
  const {
    isSessionExpiredModalOpen,
    closeSessionExpiredModal,
    user,
    loginWithCredentials,
    logout,
  } = useSessionStore();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isSessionExpiredModalOpen || !user) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Şifrəni daxil edin.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const result = loginWithCredentials(user.username, password);
      setIsLoading(false);

      if (result.success) {
        setPassword('');
        closeSessionExpiredModal();
      } else {
        setError(result.error || 'Şifrə yanlışdır.');
      }
    }, 400);
  };

  const handleLogout = () => {
    logout();
    closeSessionExpiredModal();
    navigate('/auth/login', { replace: true });
  };

  return (
    <Modal
      isOpen={isSessionExpiredModalOpen}
      onClose={() => {}} // Disallow closing by backdrop click
      title="Sessiya Müddəti Bitdi"
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            Hərəkətsizlik səbəbindən təhlükəsizlik məqsədilə sessiyanız donduruldu.
            <strong className="block text-foreground mt-0.5">
              Daxil etdiyiniz forma və qaralama məlumatları qorunur.
            </strong>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bh-accent text-bh-accent-foreground font-bold text-xs">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded bg-danger/10 border border-danger/30 text-xs text-danger font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="reauth-password" className="text-xs font-semibold text-foreground">
              Şifrənizi daxil edin
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                id="reauth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrə"
                autoFocus
                disabled={isLoading}
                className="w-full rounded-md border border-input bg-background pl-9 pr-10 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Gizlət' : 'Göstər'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground pt-0.5">
              İpucu: Demo üçün istənilən hesabda &quot;Admin123!&quot; və ya cari şifrəni yaza bilərsiniz.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              variant="default"
              size="sm"
              isLoading={isLoading}
              className="flex-1"
            >
              Davam Et (Kilidi Aç)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-danger hover:text-danger"
              title="Çıxış et"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Çıxış
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

