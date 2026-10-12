import React, { useState, useEffect } from 'react';
import {
  TrendingDown,
  Sparkles,
  Percent,
  CheckCircle2,
  RotateCw,
  ShoppingBag,
} from 'lucide-react';
import { biRepository } from '../../../shared/adapters';
import { InventoryIntelligenceData, ReorderSuggestionItem } from '../types';
import { ReorderSuggestionCard } from '../components/ReorderSuggestionCard';

export const InventoryIntelligencePage: React.FC = () => {
  const [data, setData] = useState<InventoryIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [poAddedSuccess, setPoAddedSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await biRepository.getInventoryIntelligence();
      setData(res);
    } catch (err) {
      console.error('Failed to load inventory intelligence:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPo = (item: ReorderSuggestionItem) => {
    setPoAddedSuccess(`${item.name} (${item.suggestedReorderQty} ədəd) satınalma planına daxil edildi.`);
    setTimeout(() => setPoAddedSuccess(null), 3000);
  };

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-xs text-gray-400">
        Anbar intellekti göstəriciləri hesablanır...
      </div>
    );
  }

  const { inventoryTurnover, daysOfInventory, totalStockValueAzn, deadStockValueAzn, seasonSellThrough, markdownCandidates, reorderSuggestions } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider flex items-center">
              <Sparkles className="w-3 h-3 mr-1" /> Ehtiyatların Dövriyyəsi & Planlama
            </span>
            <span className="text-xs text-slate-400">• Real-Time Stock Analytics</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Anbar İntellekti (Inventory Intelligence)</h1>
          <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
            DIO (dövriyyə müddəti), mövsümi satılma dərəcələri (Sell-Through Rate), endirim namizədləri və şəffaf formulalı təkrar sifariş təklifləri.
          </p>
        </div>
      </div>

      {poAddedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{poAddedSuccess}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Ehtiyat Dövriyyə Sürəti
          </span>
          <div className="text-2xl font-black text-gray-900 font-mono">
            {inventoryTurnover}x / il
          </div>
          <span className="text-xs text-emerald-600 font-semibold flex items-center">
            <RotateCw className="w-3.5 h-3.5 mr-1" />
            Optimal pərakəndə norma
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Orta Qalma Müddəti (DIO)
          </span>
          <div className="text-2xl font-black text-indigo-600 font-mono">
            {daysOfInventory} gün
          </div>
          <span className="text-xs text-gray-400 block">Ehtiyatların nağda çevrilməsi</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Cəmi Stok Maya Dəyəri
          </span>
          <div className="text-2xl font-black text-gray-900 font-mono">
            {totalStockValueAzn.toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-gray-400 block">Çəkili orta maya qiyməti ilə</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block">
            Ölü Stok Həcmi (&gt;90 gün)
          </span>
          <div className="text-2xl font-black text-rose-600 font-mono">
            {deadStockValueAzn.toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-rose-500 font-semibold block">Dərhal likvidləşdirilməlidir</span>
        </div>
      </div>

      {/* Season Sell-Through Rate (STR) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <Percent className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Mövsümi Satılma Dərəcəsi (Sell-Through Rate — STR)</h3>
          </div>
          <span className="text-xs text-gray-400">Formula: (Satılan Qty ÷ İlkin Qalıq) × 100</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {seasonSellThrough.map((s, idx) => (
            <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">{s.season}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    s.status === 'fast'
                      ? 'bg-emerald-100 text-emerald-800'
                      : s.status === 'optimal'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {s.status === 'fast' ? 'Sürətli Satış' : s.status === 'optimal' ? 'Optimal' : 'Ləng'}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black font-mono text-gray-900">{s.strPercent}%</span>
                <span className="text-xs text-gray-500 font-mono">
                  {s.soldQty} / {s.initialStockQty} ədəd
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    s.status === 'fast' ? 'bg-emerald-500' : s.status === 'optimal' ? 'bg-indigo-600' : 'bg-amber-500'
                  }`}
                  style={{ width: `${s.strPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 pt-1">Qalıq: {s.currentStockQty} ədəd</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reorder Suggestions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">
              Şəffaf Formulalı Təkrar Sifariş Təklifləri (Auto-Reorder Suggestions)
            </h3>
          </div>
          <span className="text-xs text-gray-400">Təhlükəsizlik ehtiyatı və satılma sürətinə əsasən</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reorderSuggestions.map((item) => (
            <ReorderSuggestionCard
              key={item.sku}
              suggestion={item}
              onAddToPo={handleAddToPo}
            />
          ))}
        </div>
      </div>

      {/* Markdown Candidates */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <TrendingDown className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-bold text-gray-900">
              Endirim və Likvidasiya Namizədləri (Markdown Candidates)
            </h3>
          </div>
          <span className="text-xs text-gray-400">&gt;90 gün qalıb satılmayan mallar</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
              <tr>
                <th className="px-4 py-2.5">SKU / Məhsul</th>
                <th className="px-4 py-2.5">Kateqoriya</th>
                <th className="px-4 py-2.5 text-center">Yaş (Gün)</th>
                <th className="px-4 py-2.5 text-center">Qalıq</th>
                <th className="px-4 py-2.5 text-right">Maya Dəyəri</th>
                <th className="px-4 py-2.5 text-right">Cari Qiymət</th>
                <th className="px-4 py-2.5 text-center">Tövsiyə Endirim</th>
                <th className="px-4 py-2.5">Səbəb & Strategiya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {markdownCandidates.map((m) => (
                <tr key={m.sku} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-900">
                    <div>{m.name}</div>
                    <span className="text-[10px] text-gray-400 font-mono">SKU: {m.sku} • {m.brand}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{m.category}</td>
                  <td className="px-4 py-2.5 text-center font-mono font-bold text-rose-600">
                    {m.ageDays} gün
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700">
                    {m.currentStock} ədəd
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                    {m.costPriceAzn.toFixed(2)} ₼
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                    {m.retailPriceAzn.toFixed(2)} ₼
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono">
                    <span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                      -{m.suggestedDiscountPercent}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-xs">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
