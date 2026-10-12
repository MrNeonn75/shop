import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Building2,
  PieChart,
  Award,
  Layers,
  Sparkles,
} from 'lucide-react';
import { biRepository } from '../../../shared/adapters';
import { ExecutiveBiData } from '../types';
import { ChartAnnotationsPanel } from '../components/ChartAnnotationsPanel';

export const ExecutiveDashboardPage: React.FC = () => {
  const [data, setData] = useState<ExecutiveBiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await biRepository.getExecutivePerformance();
      setData(res);
    } catch (err) {
      console.error('Failed to load executive BI data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-xs text-gray-400">
        Rəhbərlik analitikası hesablanır...
      </div>
    );
  }

  const { periodSummary, periodComparisons, branchRankings, sectionMix, topProductCohorts, annotations } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider flex items-center">
              <Sparkles className="w-3 h-3 mr-1" /> Baş İcraçı Analitika
            </span>
            <span className="text-xs text-slate-400">• Oktyabr 2026</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Rəhbərlik Paneli (Executive BI)</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Filiallar üzrə dövriyyə, plan hədəflərinin icrası, kateqoriya strukturu və müqayisəli artım templəri.
          </p>
        </div>

        {/* Target Progress Pill */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 space-y-1 text-right">
          <span className="text-[11px] text-indigo-200 uppercase tracking-wider block font-medium">
            Aylıq Plan İcrası
          </span>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {periodSummary.targetAchievementPercent}%
          </div>
          <span className="text-[10px] text-slate-300 block">
            Faktiki: {periodSummary.currentSalesAzn.toLocaleString('az-AZ')} ₼ / Plan: 140,000 ₼
          </span>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Cari Satış Dövriyyəsi
          </span>
          <div className="text-xl font-black text-gray-900 font-mono">
            {periodSummary.currentSalesAzn.toLocaleString('az-AZ')} ₼
          </div>
          <div className="flex items-center text-xs font-semibold text-emerald-600">
            <TrendingUp className="w-4 h-4 mr-1" />
            <span>+{periodSummary.growthPercent}% keçən aydan</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Ötən Dövr Dövriyyəsi
          </span>
          <div className="text-xl font-black text-gray-900 font-mono">
            {periodSummary.previousSalesAzn.toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-gray-400 block">Sentyabr 2026 bazası</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Mütləq Artım Həcmi
          </span>
          <div className="text-xl font-black text-indigo-600 font-mono">
            +{(periodSummary.currentSalesAzn - periodSummary.previousSalesAzn).toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-emerald-600 font-semibold block">Müsbət əməliyyat dinamikası</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
            Hədəf Fərqi (Target Gap)
          </span>
          <div className="text-xl font-black text-amber-600 font-mono">
            -{(140000 - periodSummary.currentSalesAzn).toLocaleString('az-AZ')} ₼
          </div>
          <span className="text-xs text-gray-500 block">Ay sonunadək hədəf: 140,000 ₼</span>
        </div>
      </div>

      {/* Grid: Branch Rankings & Category Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Branch Rankings */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">Filial Reytinqi və Hədəf İcrası</h3>
            </div>
            <span className="text-xs text-gray-400">Oktyabr 2026</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2.5">Filial</th>
                  <th className="px-3 py-2.5 text-right">Satış (AZN)</th>
                  <th className="px-3 py-2.5 text-right">Pay (%)</th>
                  <th className="px-3 py-2.5 text-right">Hədəf İcrası</th>
                  <th className="px-3 py-2.5 text-right">Çek Sayı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {branchRankings.map((b, idx) => (
                  <tr key={b.branchId} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-gray-900 flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      <span>{b.branchName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">
                      {b.salesAzn.toLocaleString('az-AZ')} ₼
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                      {b.sharePercent}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          b.achievementPercent >= 100
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.achievementPercent}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                      {b.ordersCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Category Mix */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">Kateqoriya və Bölmə Payı</h3>
            </div>
          </div>

          <div className="space-y-3">
            {sectionMix.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-gray-700">
                  <span>{item.section}</span>
                  <span className="font-mono text-gray-900">
                    {item.salesAzn.toLocaleString('az-AZ')} ₼ ({item.sharePercent}%) • Marja: {item.marginPercent}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full"
                    style={{ width: `${item.sharePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Product Cohorts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <Award className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Lider Məhsul Kohortaları (Top Performers)</h3>
          </div>
          <span className="text-xs text-gray-400">Dövriyyə və ədəd həcminə görə</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
              <tr>
                <th className="px-4 py-2.5">Reytinq</th>
                <th className="px-4 py-2.5">Məhsul Adı</th>
                <th className="px-4 py-2.5">Brend</th>
                <th className="px-4 py-2.5">Kateqoriya</th>
                <th className="px-4 py-2.5 text-right">Satılmış Ədəd</th>
                <th className="px-4 py-2.5 text-right">Gəlir (AZN)</th>
                <th className="px-4 py-2.5 text-right">Artım (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topProductCohorts.map((item) => (
                <tr key={item.sku} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-bold text-slate-800 font-mono">
                    #{item.rank}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">
                    {item.name}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{item.brand}</td>
                  <td className="px-4 py-2.5 text-gray-600">{item.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-800">
                    {item.unitsSold}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                    {item.revenueAzn.toLocaleString('az-AZ')} ₼
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">
                    <span
                      className={item.growthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                    >
                      {item.growthPercent >= 0 ? `+${item.growthPercent}%` : `${item.growthPercent}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Period Comparisons Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Dövrlər Üzrə Müqayisəli Göstəricilər</h3>
          </div>
          <span className="text-xs text-gray-400">Oktyabr vs Sentyabr 2026</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
              <tr>
                <th className="px-4 py-2.5">Göstərici</th>
                <th className="px-4 py-2.5 text-right">Cari Dövr</th>
                <th className="px-4 py-2.5 text-right">Əvvəlki Dövr</th>
                <th className="px-4 py-2.5 text-right">Mütləq Fərq</th>
                <th className="px-4 py-2.5 text-right">Faiz Dəyişimi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periodComparisons.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{row.metric}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                    {row.currentValue.toLocaleString('az-AZ')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                    {row.previousValue.toLocaleString('az-AZ')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">
                    {row.varianceAbsolute > 0 ? `+${row.varianceAbsolute.toLocaleString('az-AZ')}` : row.varianceAbsolute.toLocaleString('az-AZ')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold">
                    <span className={row.variancePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {row.variancePercent >= 0 ? `+${row.variancePercent}%` : `${row.variancePercent}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart Annotations Panel */}
      <ChartAnnotationsPanel
        annotations={annotations}
        onAnnotationAdded={(newAnn) => {
          setData({
            ...data,
            annotations: [newAnn, ...data.annotations],
          });
        }}
      />
    </div>
  );
};
