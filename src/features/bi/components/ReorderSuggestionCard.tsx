import React, { useState } from 'react';
import { Package, Calculator, Info, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';
import { ReorderSuggestionItem } from '../types';

interface ReorderSuggestionCardProps {
  suggestion: ReorderSuggestionItem;
  onAddToPo?: (suggestion: ReorderSuggestionItem) => void;
}

export const ReorderSuggestionCard: React.FC<ReorderSuggestionCardProps> = ({
  suggestion,
  onAddToPo,
}) => {
  const [showFormula, setShowFormula] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow transition-all space-y-3">
      {/* Top info */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start space-x-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              {suggestion.brand}
            </span>
            <h4 className="text-xs font-bold text-gray-900 leading-snug">
              {suggestion.name}
            </h4>
            <p className="text-[11px] text-gray-500 font-mono">SKU: {suggestion.sku}</p>
          </div>
        </div>

        {/* Suggested Order Qty Badge */}
        <div className="text-right">
          <span className="text-[10px] text-gray-500 uppercase font-semibold block">
            Tövsiyə Sifariş
          </span>
          <span className="text-base font-extrabold text-indigo-600 font-mono">
            {suggestion.suggestedReorderQty} ədəd
          </span>
        </div>
      </div>

      {/* Input Metrics Matrix */}
      <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center text-xs">
        <div>
          <span className="text-[10px] text-gray-400 block">Qalıq</span>
          <strong className="text-gray-800 font-mono">{suggestion.currentStock}</strong>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 block">Günlük Satış</span>
          <strong className="text-gray-800 font-mono">{suggestion.dailyVelocity} əd/gün</strong>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 block">Tədarük (G)</span>
          <strong className="text-gray-800 font-mono">{suggestion.leadTimeDays} gün</strong>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 block">Ehtiyat</span>
          <strong className="text-gray-800 font-mono">{suggestion.safetyStock}</strong>
        </div>
      </div>

      {/* Transparent Formula Drawer Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowFormula(!showFormula)}
          className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center space-x-1 font-medium"
        >
          <Calculator className="w-3.5 h-3.5 text-indigo-500" />
          <span>Şəffaf Hesablama Düsturu</span>
          {showFormula ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showFormula && (
          <div className="mt-2 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs space-y-1.5 text-indigo-950">
            <div className="flex items-start space-x-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] leading-relaxed">
                {suggestion.explanation.formulaText}
              </p>
            </div>
            <div className="text-[10px] text-indigo-700 bg-white/70 p-1.5 rounded font-mono">
              Giriş Parametrləri: Sürət={suggestion.explanation.dailyVelocityInput}, Tədarük={suggestion.explanation.leadTimeDaysInput} gün, Təhlükəsizlik={suggestion.explanation.safetyStockInput} ədəd
            </div>
          </div>
        )}
      </div>

      {/* Action button */}
      {onAddToPo && (
        <div className="pt-1">
          <button
            onClick={() => onAddToPo(suggestion)}
            className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Sifariş Planına Əlavə Et</span>
          </button>
        </div>
      )}
    </div>
  );
};

