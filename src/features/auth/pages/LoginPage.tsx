import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, AlertCircle, ShieldAlert } from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { DEMO_USERS_LIST } from '../../../shared/adapters/mock/demoUsers';
import { UserRole } from '../../../shared/utils/permissions';
import { BrandLogo } from '../../../components/ui/BrandLogo';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  const { loginWithCredentials, loginDemo, lockoutUntil } = useSessionStore();

  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('AdminPassword123!');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim()) {
      setErrorMessage('İstifadəçi adını və ya email ünvanını daxil edin.');
      return;
    }
    if (!password) {
      setErrorMessage('Şifrəni daxil edin.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const result = loginWithCredentials(identifier, password);
      setIsLoading(false);

      if (result.success) {
        navigate(redirectPath, { replace: true });
      } else {
        setErrorMessage(result.error || 'Daxil olarkən xəta baş verdi.');
      }
    }, 400);
  };

  const handleQuickLogin = (role: UserRole) => {
    loginDemo(role);
    navigate(redirectPath, { replace: true });
  };

  const isLockedOut = Boolean(lockoutUntil && lockoutUntil > Date.now());

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 py-8 selection:bg-bh-black selection:text-bh-white">
      {/* Background Subtle Gradient & Grid Pattern */}
      <div className="absolute inset-0 bg-radial-gradient opacity-40 pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Header / Brand */}
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size="lg" showWordmark={true} className="mb-2" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Sistemə Giriş
          </h1>
          <p className="text-xs text-muted-foreground max-w-xs">
            BRAND HOUSE ERP — Çoxfiliallı Pərakəndə İdarəetmə Platforması
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger animate-in fade-in"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {isLockedOut && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-xs text-warning"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Təhlükəsizlik blokadası aktivdir!</p>
                <p className="mt-0.5 text-muted-foreground">
                  Həddindən artıq yanlış giriş cəhdi qeydə alınıb. Giriş müvəqqəti məhdudlaşdırılıb.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="identifier"
                className="text-xs font-semibold text-foreground flex items-center justify-between"
              >
                <span>İstifadəçi adı və ya Email</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin və ya admin@brendhouse.az"
                  disabled={isLockedOut || isLoading}
                  className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="password" className="font-semibold text-foreground">
                  Şifrə
                </label>
                <Link
                  to="/auth/forgot-password"
                  className="text-muted-foreground hover:text-foreground font-medium underline-offset-4 hover:underline transition-colors"
                >
                  Şifrəni unutmusunuz?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isLockedOut || isLoading}
                  className="w-full rounded-md border border-input bg-background pl-9 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showPassword ? 'Şifrəni gizlət' : 'Şifrəni göstər'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="default"
              size="md"
              isLoading={isLoading}
              disabled={isLockedOut}
              className="w-full mt-2"
            >
              Daxil Ol
            </Button>
          </form>

          {/* Quick Demo Switcher Section */}
          <div className="mt-6 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                Sınaq İstifadəçiləri (1-Klik Giriş)
              </span>
              <Badge variant="neutral" size="sm" className="text-[10px]">
                DEMO REJİMİ
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS_LIST.map((demo) => (
                <button
                  key={demo.user.role}
                  type="button"
                  onClick={() => handleQuickLogin(demo.user.role)}
                  className="flex flex-col text-left p-2.5 rounded-lg border border-border bg-muted/40 hover:bg-muted hover:border-bh-black dark:hover:border-bh-white transition-all text-xs group"
                >
                  <span className="font-semibold text-foreground group-hover:text-bh-accent transition-colors">
                    {demo.badgeLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {demo.user.name}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2.5 text-center leading-relaxed">
              İstənilən demo roluna toxunaraq həmin rolun xüsusi icazə və filial səlahiyyətləri ilə sistemə dərhal daxil ola bilərsiniz.
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-muted-foreground">
          &copy; 2026 BRAND HOUSE MMC. Bütün hüquqlar qorunur.
        </div>
      </div>
    </div>
  );
};

