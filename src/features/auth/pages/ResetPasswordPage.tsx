import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Check, X, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '../../../components/ui/BrandLogo';
import { Button } from '../../../components/ui/Button';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || 'demo-reset-token';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strength rules
  const rules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const passedCount = Object.values(rules).filter(Boolean).length;
  const isAllValid = passedCount === 5;
  const isMatch = password.length > 0 && password === confirmPassword;

  let strengthLabel = 'Zəif';
  let strengthColor = 'bg-danger';
  if (passedCount >= 4) {
    strengthLabel = 'Güclü';
    strengthColor = 'bg-success';
  } else if (passedCount >= 3) {
    strengthLabel = 'Orta';
    strengthColor = 'bg-warning';
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isAllValid) {
      setError('Şifrə bütün təhlükəsizlik tələblərinə cavab verməlidir.');
      return;
    }
    if (!isMatch) {
      setError('Təkrar şifrə uyğun gəlmir.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/auth/login', { replace: true });
      }, 2000);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size="lg" showWordmark={true} className="mb-2" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Yeni Şifrə Təyini
          </h1>
          <p className="text-xs text-muted-foreground">
            Hesabınız üçün yeni və güclü təhlükəsizlik şifrəsi daxil edin.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {isSuccess ? (
            <div className="text-center space-y-3 py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Şifrəniz Uğurla Yeniləndi!
              </h3>
              <p className="text-xs text-muted-foreground">
                Sistem avtomatik olaraq giriş səhifəsinə yönləndirilir...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger font-medium">
                  {error}
                </div>
              )}

              {/* Hidden/Info token badge */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-muted/40 p-2 rounded border border-border">
                <span>Təsdiq Tokeni:</span>
                <span className="font-mono font-medium truncate max-w-[180px]">
                  {token}
                </span>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="new-password"
                  className="text-xs font-semibold text-foreground"
                >
                  Yeni Şifrə
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Yeni şifrənizi daxil edin"
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background pl-9 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showPassword ? 'Gizlət' : 'Göstər'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength Meter Bar */}
                {password.length > 0 && (
                  <div className="pt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Şifrə dərəcəsi:</span>
                      <span className="font-semibold text-foreground">{strengthLabel}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${strengthColor} transition-all duration-300`}
                        style={{ width: `${(passedCount / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="text-xs font-semibold text-foreground"
                >
                  Şifrənin Təkrarı
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Şifrəni təkrar daxil edin"
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background pl-9 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showConfirmPassword ? 'Gizlət' : 'Göstər'}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p
                    className={`text-[11px] font-medium ${
                      isMatch ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {isMatch ? '✓ Şifrələr uyğun gəlir' : '✗ Şifrələr eyni deyil'}
                  </p>
                )}
              </div>

              {/* Checklist Rules */}
              <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-1.5 text-[11px]">
                <span className="font-semibold text-foreground block">
                  Təhlükəsizlik tələbləri:
                </span>
                <ul className="space-y-1">
                  <li className="flex items-center gap-1.5">
                    {rules.length ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={rules.length ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      Ən azı 8 simvol
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {rules.uppercase ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={rules.uppercase ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      Ən azı bir böyük hərf (A-Z)
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {rules.lowercase ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={rules.lowercase ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      Ən azı bir kiçik hərf (a-z)
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {rules.number ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={rules.number ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      Ən azı bir rəqəm (0-9)
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    {rules.special ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={rules.special ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      Ən azı bir xüsusi simvol (!@#$%^&*)
                    </span>
                  </li>
                </ul>
              </div>

              <Button
                type="submit"
                variant="default"
                size="md"
                isLoading={isLoading}
                disabled={!isAllValid || !isMatch}
                className="w-full mt-2"
              >
                Yeni Şifrəni Yadda Saxla
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Girişə qayıt</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

