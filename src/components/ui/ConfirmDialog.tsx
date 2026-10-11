import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Textarea } from './Textarea';
import { FormField } from './FormField';
import { AlertTriangle, Info } from 'lucide-react';

export interface ConfirmDialogProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default' | 'primary';
  showReasonField?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  title,
  description,
  confirmText = 'Təsdiq et',
  cancelText = 'Ləğv et',
  variant = 'default',
  showReasonField = false,
  reasonLabel = 'Səbəbi daxil edin',
  reasonPlaceholder = 'Məs: Xətalı qeydiyyat, məhsul defekti və s.',
  reasonRequired = false,
  onConfirm,
  isLoading = false,
  children,
}) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const isDialogOpen = isOpen !== undefined ? isOpen : (open ?? false);

  const handleCancel = () => {
    setReason('');
    setReasonError('');
    if (onOpenChange) onOpenChange(false);
    if (onClose) onClose();
  };

  const handleConfirm = async () => {
    if (showReasonField && reasonRequired && !reason.trim()) {
      setReasonError('Səbəb qeyd olunmalıdır.');
      return;
    }
    await onConfirm(reason);
    setReason('');
    setReasonError('');
    if (onOpenChange) onOpenChange(false);
    if (onClose) onClose();
  };

  return (
    <Modal
      open={isDialogOpen}
      onOpenChange={(v) => {
        if (!v) handleCancel();
        else if (onOpenChange) onOpenChange(v);
      }}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2">
          {variant === 'danger' ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-danger shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-info/10 text-info shrink-0">
              <Info className="h-4 w-4" />
            </div>
          )}
          <span>{title}</span>
        </div>
      }
      description={description}
      footer={
        <div className="flex gap-2 w-full justify-end">
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      {children}
      {showReasonField && (
        <div className="mt-2">
          <FormField
            label={reasonLabel}
            required={reasonRequired}
            error={reasonError}
          >
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError('');
              }}
              placeholder={reasonPlaceholder}
              rows={3}
              hasError={Boolean(reasonError)}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
};
