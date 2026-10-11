import React, { useEffect } from 'react';
import { usePosStore } from '../stores/posStore';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { PosShiftHeader } from '../components/PosShiftHeader';
import { PosErrorBoundary } from '../components/PosErrorBoundary';

interface Props {
  children: React.ReactNode;
}

export const PosLayout: React.FC<Props> = ({ children }) => {
  const user = useSessionStore((s) => s.user);
  const {
    initialize,
    items,
    selectedItemId,
    updateQuantity,
    removeItem,
    setCustomerModalOpen,
    setDiscountModalOpen,
    setReturnExchangeModalOpen,
    setSuspendModalOpen,
    setRecallModalOpen,
    setPaymentModalOpen,
    setShortcutsHelpOpen,
    setOpenShiftModalOpen,
    setCloseShiftModalOpen,
    setCashInOutModalOpen,
    setReceiptLookupModalOpen,
    setXReportModalOpen,
    isPaymentModalOpen,
    isCustomerModalOpen,
    isDiscountModalOpen,
    isReturnExchangeModalOpen,
    isSuspendModalOpen,
    isRecallModalOpen,
    isShortcutsHelpOpen,
    isOpenShiftModalOpen,
    isCloseShiftModalOpen,
    isCashInOutModalOpen,
    isReceiptLookupModalOpen,
    isXReportModalOpen,
  } = usePosStore();

  const branchId = user?.branchId || 'branch-2';
  const cashierId = user?.id || 'usr-004';

  useEffect(() => {
    initialize(branchId, cashierId);
  }, [branchId, cashierId, initialize]);

  // Global Keyboard Shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      // F1: Shortcuts help
      if (e.key === 'F1') {
        e.preventDefault();
        setShortcutsHelpOpen(true);
        return;
      }

      // F2: Customer
      if (e.key === 'F2') {
        e.preventDefault();
        setCustomerModalOpen(true);
        return;
      }

      // F4: Discount
      if (e.key === 'F4') {
        e.preventDefault();
        setDiscountModalOpen(true);
        return;
      }

      // F7: Return / Exchange
      if (e.key === 'F7') {
        e.preventDefault();
        setReturnExchangeModalOpen(true);
        return;
      }

      // F8: Suspend
      if (e.key === 'F8') {
        e.preventDefault();
        if (items.length > 0) setSuspendModalOpen(true);
        return;
      }

      // F9: Recall
      if (e.key === 'F9') {
        e.preventDefault();
        setRecallModalOpen(true);
        return;
      }

      // F10: Pay
      if (e.key === 'F10') {
        e.preventDefault();
        if (items.length > 0) setPaymentModalOpen(true);
        return;
      }

      // Esc: Close any active modal
      if (e.key === 'Escape') {
        if (isPaymentModalOpen) setPaymentModalOpen(false);
        else if (isCustomerModalOpen) setCustomerModalOpen(false);
        else if (isDiscountModalOpen) setDiscountModalOpen(false);
        else if (isReturnExchangeModalOpen) setReturnExchangeModalOpen(false);
        else if (isSuspendModalOpen) setSuspendModalOpen(false);
        else if (isRecallModalOpen) setRecallModalOpen(false);
        else if (isShortcutsHelpOpen) setShortcutsHelpOpen(false);
        else if (isOpenShiftModalOpen) setOpenShiftModalOpen(false);
        else if (isCloseShiftModalOpen) setCloseShiftModalOpen(false);
        else if (isCashInOutModalOpen) setCashInOutModalOpen(false);
        else if (isReceiptLookupModalOpen) setReceiptLookupModalOpen(false);
        else if (isXReportModalOpen) setXReportModalOpen(false);
        return;
      }

      // If typing in an input field, do not hijack +/- or Del
      if (isInput) return;

      // +/- for quantity on selected line
      if (selectedItemId) {
        const item = items.find((i) => i.id === selectedItemId);
        if (item) {
          if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            updateQuantity(item.id, item.quantity + 1);
          } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            updateQuantity(item.id, item.quantity - 1);
          } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            removeItem(item.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    items,
    selectedItemId,
    updateQuantity,
    removeItem,
    setCustomerModalOpen,
    setDiscountModalOpen,
    setReturnExchangeModalOpen,
    setSuspendModalOpen,
    setRecallModalOpen,
    setPaymentModalOpen,
    setShortcutsHelpOpen,
    isOpenShiftModalOpen,
    isCloseShiftModalOpen,
    isCashInOutModalOpen,
    isReceiptLookupModalOpen,
    isXReportModalOpen,
    isPaymentModalOpen,
    isCustomerModalOpen,
    isDiscountModalOpen,
    isReturnExchangeModalOpen,
    isSuspendModalOpen,
    isRecallModalOpen,
    isShortcutsHelpOpen,
    setOpenShiftModalOpen,
    setCloseShiftModalOpen,
    setCashInOutModalOpen,
    setReceiptLookupModalOpen,
    setXReportModalOpen,
  ]);

  return (
    <PosErrorBoundary>
      <div className="flex flex-col h-screen w-screen bg-black text-white overflow-hidden select-none font-sans antialiased">
        <PosShiftHeader />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </PosErrorBoundary>
  );
};
