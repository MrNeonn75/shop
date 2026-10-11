import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ConflictRetryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  title?: string;
  message?: string;
}

export const ConflictRetryDialog: React.FC<ConflictRetryDialogProps> = ({
  isOpen,
  onClose,
  onRefresh,
  title = '409 Münaqişə: Eynizamanlı Dəyişiklik Aşkarlandı',
  message = 'Bu sənəd və ya transfer başqa bir istifadəçi və ya sistem prosesi tərəfindən yenilənmişdir. Təkrar icra etməzdən əvvəl məlumatları yeniləməyiniz tövsiyə olunur.',
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={onClose}>
            Bağla
          </Button>
          <Button
            variant="default"
            onClick={() => {
              onClose();
              onRefresh();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Məlumatları Yenilə və Təkrar Bax
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3 p-1">
        <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-foreground font-medium">{message}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Ledger bütövlüyünü qorumaq üçün sistem ziddiyyətli hərəkətlərin paralel icrasını bloklayır.
            Zəhmət olmasa cari statusu yeniləyin və ən son qalıqlarla əməliyyatı davam etdirin.
          </p>
        </div>
      </div>
    </Modal>
  );
};
