import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { ManagerPinConfig } from '../types/permissionsAdvanced';
import { KeyRound, Unlock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; name: string; roleName: string; branchName: string };
  pinConfig?: ManagerPinConfig;
  onSavePin?: (userId: string, newPin: string, reason: string) => Promise<void>;
  onUnlockPin?: (userId: string) => Promise<void>;
  onSuccess?: () => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  user,
  pinConfig,
  onSavePin,
  onUnlockPin,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLocked = pinConfig?.isLocked || false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      toast({
        type: 'error',
        title: 'Yanlış PIN formatı',
        message: 'Manager PIN yalnız 4 və ya 6 rəqəmdən ibarət olmalıdır.',
      });
      return;
    }

    if (pin !== confirmPin) {
      toast({
        type: 'error',
        title: 'PIN kodlar uyğun gəlmir',
        message: 'Daxil edilmiş hər iki PIN kodu eyni olmalıdır.',
      });
      return;
    }

    if (!reason || reason.trim().length < 5) {
      toast({
        type: 'error',
        title: 'Səbəb tələb olunur',
        message: 'PIN kodunun dəyişdirilməsi üçün əsaslandırılmış səbəb qeyd edin.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (onSavePin) {
        await onSavePin(user.id, pin, reason);
      }
      onSuccess?.();
      toast({
        type: 'success',
        title: 'Manager PIN yeniləndi',
        message: `${user.name} üçün POS təsdiq PIN kodu uğurla təyin edildi.`,
      });
      setPin('');
      setConfirmPin('');
      setReason('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PIN kodunu saxlamaq mümkün olmadı.';
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    if (!onUnlockPin) return;
    setIsSubmitting(true);
    try {
      await onUnlockPin(user.id);
      toast({
        type: 'success',
        title: 'PIN Kilidi Açıldı',
        message: 'Kassada uğursuz cəhdlər səbəbilə qoyulmuş bloklanma ləğv edildi.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kilidi açmaq mümkün olmadı.';
      toast({
        type: 'error',
        title: 'Xəta baş verdi',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="POS Menecer Təsdiq PIN İdarəetməsi"
      size="md"
    >
      <div className="space-y-4">
        <div className="bg-muted/40 p-3 rounded-lg border border-border text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">{user.name}</span>
            <Badge variant="outline" size="sm">
              {user.roleName}
            </Badge>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Filial: <strong>{user.branchName}</strong> • Bu PIN POS terminalında qiymət override-ı, böyük endirim və qaytarmaları təsdiq etmək üçün istifadə olunur.
          </p>
        </div>

        {/* Lockout status indicator */}
        {isLocked ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <div>
                <p className="text-xs font-semibold text-destructive">PIN Hesabı Bloklanıb</p>
                <p className="text-[11px] text-muted-foreground">
                  POS terminalında 3 dəfə ardıcıl yanlış PIN daxil edildiyi üçün kilidlənib.
                </p>
              </div>
            </div>
            {onUnlockPin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnlock}
                disabled={isSubmitting}
                className="shrink-0 text-xs"
              >
                <Unlock className="h-3.5 w-3.5 mr-1" />
                Kilidi Aç
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2.5 rounded border border-emerald-500/20">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>PIN statusu: {pinConfig?.isPinSet ? 'Aktivdir (Təyin edilib)' : 'Hələ təyin edilməyib'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Yeni Menecer PIN Kodu (4-6 rəqəm)
            </label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono tracking-widest text-center"
              required
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              * Təhlükəsizlik qaydası: PIN kodu heç vaxt ekranda açıq göstərilmir və serverdə şifrələnmiş saxlanılır.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              PIN Kodunu Təkrar Daxil Edin
            </label>
            <input
              type="password"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono tracking-widest text-center"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Dəyişiklik Səbəbi / Əsaslandırma <span className="text-destructive">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="məs: Yeni filial meneceri təyinatı, təhlükəsizlik dövri yeniləməsi"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Ləğv Et
            </Button>
            <Button type="submit" variant="default" size="sm" disabled={isSubmitting}>
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              PIN Kodunu Saxla
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
