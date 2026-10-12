import React from 'react';
import { ReceiptTemplateConfig } from '../types/systemSettings';
import { Printer } from 'lucide-react';

interface ReceiptTemplatePreviewProps {
  config: ReceiptTemplateConfig;
  onChange?: (updated: ReceiptTemplateConfig) => void;
}

export const ReceiptTemplatePreview: React.FC<ReceiptTemplatePreviewProps> = ({ config, onChange: _onChange }) => {
  const is58mm = config.paperWidth === '58mm';

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
        <Printer className="h-4 w-4" />
        <span>Fiskal / POS Çekinin Canlı Önbaxışı ({config.paperWidth})</span>
      </div>

      {/* Realistic POS Paper Simulation */}
      <div
        className={`bg-white text-zinc-900 shadow-lg rounded-sm p-4 font-mono text-[11px] leading-tight border border-zinc-300 transition-all select-none ${
          is58mm ? 'w-[240px]' : 'w-[320px]'
        }`}
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        {/* Header Section */}
        <div className="text-center space-y-1 pb-2 border-b border-dashed border-zinc-400">
          {config.logoEnabled && (
            <div className="flex justify-center mb-1">
              <div className="h-7 w-7 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-[12px]">
                BH
              </div>
            </div>
          )}
          <h4 className="font-bold text-xs uppercase tracking-wider">{config.headerTitle}</h4>
          <p className="text-[10px] text-zinc-600">{config.headerAddress}</p>
          <p className="text-[10px] text-zinc-600">Tel: {config.headerPhone}</p>
          <p className="text-[10px] font-semibold">{config.headerVoen}</p>
        </div>

        {/* Transaction Metadata */}
        <div className="py-2 text-[10px] space-y-0.5 border-b border-dashed border-zinc-400">
          <div className="flex justify-between">
            <span>Çek №:</span>
            <span className="font-bold">CK-28M-2026-000142</span>
          </div>
          <div className="flex justify-between">
            <span>Tarix / Saat:</span>
            <span>12.10.2026 14:32</span>
          </div>
          {config.showCashierName && (
            <div className="flex justify-between">
              <span>Kassir:</span>
              <span>Aytən Həsənova</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Kassa / POS:</span>
            <span>POS-01 (28 May)</span>
          </div>
        </div>

        {/* Line Items Sample */}
        <div className="py-2 space-y-1.5 border-b border-dashed border-zinc-400">
          <div className="flex justify-between text-[10px] font-bold">
            <span>MƏHSUL</span>
            <span>MƏBLƏĞ</span>
          </div>
          <div className="text-[10px]">
            <div className="flex justify-between">
              <span className="truncate pr-1">Pambıq Köynək (Ağ/M)</span>
              <span>65.00</span>
            </div>
            <div className="text-[9px] text-zinc-500 pl-2">1 ədəd × 65.00 AZN</div>
          </div>
          <div className="text-[10px]">
            <div className="flex justify-between">
              <span className="truncate pr-1">Slim Fit Cins Şalvar</span>
              <span>95.00</span>
            </div>
            <div className="text-[9px] text-zinc-500 pl-2">1 ədəd × 95.00 AZN</div>
          </div>
        </div>

        {/* Totals Section */}
        <div className="py-2 space-y-1 border-b border-dashed border-zinc-400">
          <div className="flex justify-between font-bold text-xs pt-0.5">
            <span>YEKUN:</span>
            <span>160.00 AZN</span>
          </div>

          {config.showTaxBreakdown && (
            <div className="text-[9px] text-zinc-600 space-y-0.5 pt-1">
              <div className="flex justify-between">
                <span>ƏDV-yə cəlb olunan:</span>
                <span>135.59 AZN</span>
              </div>
              <div className="flex justify-between">
                <span>ƏDV (18%):</span>
                <span>24.41 AZN</span>
              </div>
            </div>
          )}

          <div className="flex justify-between text-[10px] pt-1">
            <span>Ödəniş üsulu:</span>
            <span>Bank Kartı (POS)</span>
          </div>
        </div>

        {/* Loyalty Points Section */}
        {config.showLoyaltyPoints && (
          <div className="py-1.5 text-[9px] border-b border-dashed border-zinc-400 space-y-0.5">
            <div className="flex justify-between">
              <span>Qazanılan Loyallıq Balı:</span>
              <span className="font-bold">+160 bal</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Cari Bal Qalığı:</span>
              <span>610 bal</span>
            </div>
          </div>
        )}

        {/* Barcode Section */}
        {config.showBarcode && (
          <div className="py-2.5 text-center space-y-1">
            {/* Visual Barcode Graphic */}
            <div className="flex justify-center items-center gap-[2px] h-9 mx-auto w-4/5 overflow-hidden">
              {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4].map((w, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900 h-full"
                  style={{ width: `${w * 1.5}px` }}
                />
              ))}
            </div>
            <span className="text-[9px] tracking-widest font-mono text-zinc-600 block">
              *CK-28M-2026-000142*
            </span>
          </div>
        )}

        {/* Footer Notes & Thank you */}
        <div className="text-center pt-2 space-y-1 text-[9px] text-zinc-600 border-t border-dashed border-zinc-400">
          <p className="font-semibold text-zinc-900">{config.thankYouMessage}</p>
          <p className="leading-tight">{config.footerNotes}</p>
        </div>
      </div>
    </div>
  );
};
