import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePosStore } from '../stores/posStore';
import { formatDateTime } from '../../../shared/utils/formatters';
import {
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Lock,
  FileText,
  DollarSign,
  HelpCircle,
  Clock,
  User,
  Store,
  Monitor,
  Printer,
  RotateCcw,
} from 'lucide-react';

export const PosShiftHeader: React.FC = () => {
  const { t } = useTranslation('pos');
  const {
    activeShift,
    isOnline,
    soundEnabled,
    toggleSound,
    lockTerminal,
    registers,
    selectedRegisterId,
    selectRegister,
    setOpenShiftModalOpen,
    setCloseShiftModalOpen,
    setCashInOutModalOpen,
    setXReportModalOpen,
    setReceiptLookupModalOpen,
    setReturnExchangeModalOpen,
    setShortcutsHelpOpen,
  } = usePosStore();

  const nextReceiptSeq = activeShift ? (activeShift.receiptSequence || 0) + 1 : 1;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const regCode = activeShift ? activeShift.registerName.replace(/[^a-zA-Z0-9]/g, '') : 'REG01';
  const receiptPreview = `RCP-${regCode}-${dateStr}-${nextReceiptSeq.toString().padStart(4, '0')}`;

  return (
    <header className="bg-black text-white border-b border-zinc-800 select-none shrink-0">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          role="alert"
          className="bg-amber-500 text-black px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 tracking-wide uppercase"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>{t('terminal.offlineNotice')}</span>
        </div>
      )}

      <div className="px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Brand & Shift Info */}
        <div className="flex items-center gap-4 flex-wrap">
          <a
            href="/"
            className="flex items-center gap-2 hover:opacity-85 transition-opacity"
            title="ERP Əsas Panelə Qayıt"
          >
            <span className="font-black text-base tracking-wider bg-white text-black px-2 py-0.5 rounded-sm">
              POS
            </span>
            <span className="font-bold text-sm tracking-tight text-zinc-100 hidden sm:inline">
              BRAND HOUSE
            </span>
          </a>

          <div className="h-5 w-px bg-zinc-800 hidden md:block" />

          {/* Shift Details */}
          {activeShift ? (
            <div className="flex items-center gap-3 text-xs text-zinc-300 flex-wrap">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-zinc-400">{t('terminal.cashier')}:</span>
                <span className="font-semibold text-white">{activeShift.cashierName}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded">
                <Store className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-semibold text-white">{activeShift.branchName}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded">
                <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-semibold text-white">{activeShift.registerName}</span>
              </div>

              <div className="hidden lg:flex items-center gap-1.5 text-zinc-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDateTime(activeShift.openedAt)}</span>
              </div>

              <div className="hidden xl:flex items-center gap-1.5 text-zinc-300 bg-zinc-900 px-2 py-1 rounded font-mono text-xs">
                <span className="text-zinc-500">{t('terminal.receiptPreview')}:</span>
                <span className="text-zinc-200 font-semibold">{receiptPreview}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 font-medium bg-amber-950/60 border border-amber-800 px-2.5 py-1 rounded">
                {t('shift.registerLocked')}
              </span>
              {registers.length > 0 && (
                <select
                  value={selectedRegisterId}
                  onChange={(e) => selectRegister(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-xs text-white px-2 py-1 rounded h-8"
                  aria-label="Kassa Aparatı Seçimi"
                >
                  {registers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions & Tools */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Network Status Indicator */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono min-h-[36px] ${
              isOnline
                ? 'bg-zinc-900 text-emerald-400 border border-emerald-900/60'
                : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}
            title={isOnline ? t('terminal.online') : t('terminal.offline')}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{isOnline ? t('terminal.online') : t('terminal.offline')}</span>
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            aria-label="Səsi aç/bağla"
            className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Səsli bildirişlər"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
          </button>

          {/* Shortcuts Help */}
          <button
            type="button"
            onClick={() => setShortcutsHelpOpen(true)}
            aria-label="Qısayollar kömək pəncərəsi"
            className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Qısayollar (F1)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* F7 Quick Return */}
          <button
            type="button"
            onClick={() => setReturnExchangeModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-medium min-h-[40px]"
            title="Qaytarılma və Dəyişdirmə (F7)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>F7 Qaytarılma</span>
          </button>

          {/* Receipts / Reprint */}
          <button
            type="button"
            onClick={() => setReceiptLookupModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-medium min-h-[40px]"
            title="Çek Axtarışı və Təkrar Çap"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden md:inline">Çeklər / SURƏT</span>
          </button>

          {/* Cash In / Out */}
          {activeShift && (
            <button
              type="button"
              onClick={() => setCashInOutModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-medium min-h-[40px]"
              title="Kassa Mədaxil və Məxaric"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline">Mədaxil/Məxaric</span>
            </button>
          )}

          {/* X-Report */}
          {activeShift && (
            <button
              type="button"
              onClick={() => setXReportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-medium min-h-[40px]"
              title="Aralıq X-Hesabat"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden lg:inline">X-Hesabat</span>
            </button>
          )}

          {/* Shift Open / Close button */}
          {activeShift ? (
            <button
              type="button"
              onClick={() => setCloseShiftModalOpen(true)}
              className="px-3.5 py-1.5 rounded bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/80 text-xs font-bold min-h-[40px] tracking-wide"
            >
              Növbəni Bağla (Z)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpenShiftModalOpen(true)}
              className="px-4 py-1.5 rounded bg-white hover:bg-zinc-200 text-black text-xs font-bold min-h-[40px] tracking-wide"
            >
              Növbəni Aç
            </button>
          )}

          {/* Lock Screen */}
          <button
            type="button"
            onClick={lockTerminal}
            aria-label="Kassanı kilidlə"
            className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Kassanı kilidlə (PIN)"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
