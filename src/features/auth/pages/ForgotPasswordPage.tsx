import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '../../../components/ui/BrandLogo';
import { Button } from '../../../components/ui/Button';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Düzgün email ünvanı daxil edin.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size="lg" showWordmark={true} className="mb-2" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Şifrənin Sıfırlanması
          </h1>
          <p className="text-xs text-muted-foreground">
            Hesabınızın bərpası üçün qeydiyyatdan keçmiş email ünvanınızı daxil edin.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-foreground">
                  Email Ünvanı
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nümunə: admin@brendhouse.az"
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="default"
                size="md"
                isLoading={isLoading}
                className="w-full mt-2"
              >
                Sıfırlama Linki Göndər
              </Button>

              <div className="pt-2 text-center">
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Giriş səhifəsinə qayıt</span>
                </Link>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-4 py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  Təsdiq E-poçtu Göndərildi!
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">{email}</span> ünvanına təhlükəsiz sıfırlama linki göndərildi. Zəhmət olmasa gələnlər qutusunu və Spam qovluğunu yoxlayın.
                </p>
              </div>

              {/* Demo Mode Direct Link Shortcut */}
              <div className="p-3 rounded-lg border border-border bg-muted/50 text-left space-y-1.5 text-xs">
                <span className="font-semibold text-foreground block">
                  Demo üçün simulyasiya keçidi:
                </span>
                <p className="text-muted-foreground text-[11px]">
                  İnkişaf və test mərhələsində token gözləmədən birbaşa yeni şifrə təyini səhifəsinə keçə bilərsiniz:
                </p>
                <Link
                  to="/auth/reset-password?token=mock-token-brandhouse-2026"
                  className="inline-block text-xs font-semibold text-bh-accent hover:underline pt-1"
                >
                  → Yeni şifrə təyin etmə səhifəsinə keç
                </Link>
              </div>

              <div className="pt-3 border-t border-border">
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Giriş səhifəsinə qayıt</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

