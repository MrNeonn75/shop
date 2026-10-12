import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserPlus,
  ShoppingBag,
  Sparkles,
  Link as LinkIcon,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { biRepository } from '../../../shared/adapters';
import { CustomerAnalyticsData } from '../types';

export const CustomerAnalyticsPage: React.FC = () => {
  const [data, setData] = useState<CustomerAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await biRepository.getCustomerAnalytics();
      setData(res);
    } catch (err) {
      console.error('Failed to load customer analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-xs text-gray-400">
        Müştəri analitikası göstəriciləri hesablanır...
      </div>
    );
  }

  const { newVsReturning, rfmSegments, ltvDistribution, basketAssociations, churnRiskCustomers } = data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider flex items-center">
              <Sparkles className="w-3 h-3 mr-1" /> Davranış & Loyallıq Analitikası
            </span>
            <span className="text-xs text-slate-400">• RFM & Səbət Təhlili</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Müştəri Analitikası (Customer Analytics)</h1>
          <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
            RFM seqmentləri, yeni vs daimi müştəri nisbəti, səbət assosiasiyaları (Market Basket Analysis) və itirilmə riski olan alıcılar.
          </p>
        </div>
      </div>

      {/* New vs Returning Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-indigo-600">
            <UserPlus className="w-5 h-5" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Yeni Müştərilər
            </span>
          </div>
          <div className="text-2xl font-black text-gray-900 font-mono">
            {newVsReturning.newCustomerCount} nəfər ({newVsReturning.newSharePercent}%)
          </div>
          <span className="text-xs text-gray-400 block">İlk alışını cari dövrdə edənlər</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-emerald-600">
            <UserCheck className="w-5 h-5" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Təkrar / Sadiq Alıcılar
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            {newVsReturning.returningCustomerCount} nəfər ({newVsReturning.returningSharePercent}%)
          </div>
          <span className="text-xs text-emerald-600 font-semibold block">Dövriyyənin 78%-ni təmin edir</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-blue-600">
            <Users className="w-5 h-5" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cəmi Aktiv Alıcı Bazası
            </span>
          </div>
          <div className="text-2xl font-black text-gray-900 font-mono">
            {newVsReturning.newCustomerCount + newVsReturning.returningCustomerCount} nəfər
          </div>
          <span className="text-xs text-gray-400 block">Təkrar alış dərəcəsi: yüksək</span>
        </div>
      </div>

      {/* RFM Segmentation Board */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">RFM Seqmentasiya Bölgüsü</h3>
          </div>
          <span className="text-xs text-gray-400">Recency (Yaxınlıq), Frequency (Tezlik), Monetary (Məbləğ)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {rfmSegments.map((seg, idx) => (
            <div
              key={idx}
              className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3"
            >
              <div>
                <span className="text-xs font-bold text-gray-900 block">{seg.segmentName}</span>
                <span className="text-[11px] text-gray-500 block leading-tight mt-1">
                  {seg.description}
                </span>
              </div>

              <div>
                <div className="text-xl font-black font-mono text-indigo-600">
                  {seg.customerCount} nəfər
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 pt-1 border-t border-slate-200 mt-2">
                  <span>Pay: {seg.sharePercent}%</span>
                  <span className="font-mono">Orta: {seg.avgSpentAzn} ₼</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LTV Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Müştəri Ömürboyu Dəyər (LTV) Səviyyələri</h3>
          </div>
          <span className="text-xs text-gray-400">Ümumi gəlir qrupları</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {ltvDistribution.map((tier, idx) => (
            <div key={idx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center space-y-1">
              <span className="text-[11px] font-semibold text-gray-500 uppercase">{tier.tierRange}</span>
              <div className="text-lg font-black font-mono text-gray-900">{tier.customerCount} alıcı</div>
              <span className="text-[10px] text-gray-400 block font-mono">{tier.totalLtvAzn.toLocaleString('az-AZ')} ₼ cəmi</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Market Basket Analysis & Churn Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Market Basket Analysis */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">
                Səbət Təhlili (Birlikdə Alınan Cütlüklər)
              </h3>
            </div>
            <span className="text-xs text-gray-400">Lift Score & Çarpaz Satış</span>
          </div>

          <div className="space-y-3">
            {basketAssociations.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between font-semibold text-gray-900">
                  <div className="flex items-center space-x-1.5">
                    <span>{item.productA}</span>
                    <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{item.productB}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 font-mono">
                    Lift: {item.liftScore}x
                  </span>
                </div>

                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>Birgə Çek Sayı: <strong className="text-gray-800">{item.coOccurrenceCount}</strong></span>
                  <span>Ehtimal (Confidence): <strong className="text-gray-800">{item.confidencePercent}%</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Churn Risk Cohorts */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-gray-900">İtirilmə Riski Olan Alıcılar (Churn Risk)</h3>
            </div>
            <span className="text-xs text-gray-400">&gt;60 gün alış etməyənlər</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2.5">Müştəri</th>
                  <th className="px-3 py-2.5 text-center">Gəlmədiyi Gün</th>
                  <th className="px-3 py-2.5 text-right">Tarixi LTV</th>
                  <th className="px-3 py-2.5 text-center">Risk Dərəcəsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {churnRiskCustomers.map((c) => (
                  <tr key={c.customerId} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-semibold text-gray-900">
                      <div>{c.name}</div>
                      <span className="text-[10px] text-gray-400 font-mono">{c.phone}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-rose-600">
                      {c.daysSinceLastPurchase} gün
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-800">
                      {c.ltvAzn.toFixed(2)} ₼
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          c.riskLevel === 'high'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {c.riskLevel === 'high' ? 'Yüksək Risk' : 'Orta'}
                      </span>
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
