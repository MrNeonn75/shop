import React, { useState, useEffect } from 'react';
import {
  Percent,
  Layers,
  Sparkles,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { biRepository } from '../../../shared/adapters';
import { ProfitabilityData } from '../types';

export const ProfitabilityPage: React.FC = () => {
  const [data, setData] = useState<ProfitabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await biRepository.getProfitabilityData();
      setData(res);
    } catch (err) {
      console.error('Failed to load profitability data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-xs text-gray-400">
        Mənfəətlilik göstəriciləri hesablanır...
      </div>
    );
  }

  const { activeCogsMethod, totalRevenueAzn, cogsAzn, grossProfitAzn, grossMarginPercent, discountLeakageAzn, returnCostAzn, marginByBrand, marginByCategory } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider flex items-center">
              <Sparkles className="w-3 h-3 mr-1" /> Maya & Marja Təhlili
            </span>
            <span className="text-xs text-slate-400">• Maliyyə Nəzarəti</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Mənfəətlilik və Marja (Profitability & Margins)</h1>
          <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
            Brendlər və kateqoriyalar üzrə xalis marjalar, endirim və qaytarmalardan qaynaqlanan mənfəət sızmaları (Profit Leakage).
          </p>
        </div>
      </div>

      {/* Mandatory Accounting COGS Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between text-xs text-blue-900 shadow-2xs">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>Aktiv Maya Dəyəri Metodologiyası:</span>
          <strong className="font-bold text-blue-950 bg-blue-100 px-2 py-0.5 rounded">
            {activeCogsMethod}
          </strong>
        </div>
        <span className="text-gray-500 text-[11px]">
          Qeyd: Nağd daxilolma (Cash received) gəlir (Revenue) deyil. Satış gəliri malın təhvil verilməsi anında tanınır.
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Xalis Satış Gəliri (Revenue)
          </span>
          <div className="text-2xl font-black text-gray-900 font-mono">
            {totalRevenueAzn.toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-gray-400 block">Endirimlər çıxıldıqdan sonra</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Satılan Malın Maya Dəyəri (COGS)
          </span>
          <div className="text-2xl font-black text-gray-900 font-mono">
            {cogsAzn.toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-gray-400 block">Dövrün birbaşa məhsul xərci</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Ümumi Mənfəət (Gross Profit)
          </span>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            {grossProfitAzn.toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-emerald-600 font-semibold flex items-center">
            <Percent className="w-3.5 h-3.5 mr-0.5" />
            Ümumi Marja: {grossMarginPercent}%
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
          <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block">
            Mənfəət Sızması (Discounts + Loss)
          </span>
          <div className="text-2xl font-black text-rose-600 font-mono">
            {(discountLeakageAzn + returnCostAzn).toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-rose-500 font-semibold block">Gəlirin ~6.4%-i</span>
        </div>
      </div>

      {/* Grid: Margin by Brand & Margin by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Margin by Brand */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <Building className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">Brendlər Üzrə Marja Təhlili</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2.5">Brend</th>
                  <th className="px-3 py-2.5 text-right">Gəlir</th>
                  <th className="px-3 py-2.5 text-right">Maya (COGS)</th>
                  <th className="px-3 py-2.5 text-right">Mənfəət</th>
                  <th className="px-3 py-2.5 text-right">Marja (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {marginByBrand.map((item) => (
                  <tr key={item.brand} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-gray-900">{item.brand}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-800">
                      {item.revenueAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                      {item.cogsAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-600">
                      {item.grossProfitAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900">
                      {item.marginPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Margin by Category */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">Kateqoriyalar Üzrə Marja Təhlili</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2.5">Kateqoriya</th>
                  <th className="px-3 py-2.5 text-right">Gəlir</th>
                  <th className="px-3 py-2.5 text-right">Maya (COGS)</th>
                  <th className="px-3 py-2.5 text-right">Mənfəət</th>
                  <th className="px-3 py-2.5 text-right">Marja (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {marginByCategory.map((item) => (
                  <tr key={item.category} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-gray-900">{item.category}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-800">
                      {item.revenueAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                      {item.cogsAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-600">
                      {item.grossProfitAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900">
                      {item.marginPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
