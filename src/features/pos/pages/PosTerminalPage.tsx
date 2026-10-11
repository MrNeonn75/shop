import React from 'react';
import { PosLayout } from '../layouts/PosLayout';
import { ProductCatalogPanel } from '../components/ProductCatalogPanel';
import { CartPanel } from '../components/CartPanel';
import { PaymentModal } from '../components/PaymentModal';
import { ReceiptPrintModal } from '../components/ReceiptPrintModal';
import { OpenShiftModal } from '../components/OpenShiftModal';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { CashInOutModal } from '../components/CashInOutModal';
import { ReceiptLookupModal } from '../components/ReceiptLookupModal';
import { ReturnExchangeModal } from '../components/ReturnExchangeModal';
import { XReportModal } from '../components/XReportModal';
import { SuspendRecallModal } from '../components/SuspendRecallModal';
import { CustomerModal } from '../components/CustomerModal';
import { DiscountModal } from '../components/DiscountModal';
import { ShortcutsHelpModal } from '../components/ShortcutsHelpModal';
import { PosLockModal } from '../components/PosLockModal';

export const PosTerminalPage: React.FC = () => {
  return (
    <PosLayout>
      {/* 2-Pane Split: Left = Catalog & Barcode (55%), Right = Cart & Totals (45%) */}
      <div className="h-full w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Pane (Catalog & Scanner) */}
        <section
          aria-label="Məhsul Kataloqu və Barkod Skaneri"
          className="lg:col-span-7 h-full overflow-hidden"
        >
          <ProductCatalogPanel />
        </section>

        {/* Right Pane (Cart & Totals) */}
        <section
          aria-label="Aktiv Səbət və Ödəniş İdarəetməsi"
          className="lg:col-span-5 h-full overflow-hidden border-t lg:border-t-0 lg:border-l border-zinc-800"
        >
          <CartPanel />
        </section>
      </div>

      {/* All POS Modals */}
      <PaymentModal />
      <ReceiptPrintModal />
      <OpenShiftModal />
      <CloseShiftModal />
      <CashInOutModal />
      <ReceiptLookupModal />
      <ReturnExchangeModal />
      <XReportModal />
      <SuspendRecallModal />
      <CustomerModal />
      <DiscountModal />
      <ShortcutsHelpModal />
      <PosLockModal />
    </PosLayout>
  );
};
