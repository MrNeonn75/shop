import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { biRepository } from '../../../shared/adapters';
import { AnomalyItem } from '../types';
import { AnomalyCard } from '../components/AnomalyCard';

export const AnomaliesPage: React.FC = () => {
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await biRepository.getAnomalies();
      setAnomalies(res);
    } catch (err) {
      console.error('Failed to load anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = anomalies.filter((a) => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    return true;
  });

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const warningCount = anomalies.filter((a) => a.severity === 'warning').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/30 text-rose-300 border border-rose-500/30 uppercase tracking-wider flex items-center">
              <ShieldAlert className="w-3 h-3 mr-1" /> Avtomatlaşdırılmış Nəzarət
            </span>
            <span className="text-xs text-slate-400">• Şübhəli Əməliyyat Meyarları</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Anomaliya və Risk Aşkarlanması</h1>
          <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
            Kassir endirimləri, qəfil qaytarma dalğaları, kassa sayım kəsirləri və qeyri-adi anbar silinmələri üzrə real-vaxt xəbərdarlıqları.
          </p>
        </div>

        {/* Anomaly Counters */}
        <div className="flex items-center space-x-3">
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-[10px] text-rose-300 uppercase tracking-wider block font-semibold">
              Kritik Risk
            </span>
            <span className="text-xl font-black font-mono text-rose-400">{criticalCount}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center">
            <span className="text-[10px] text-amber-300 uppercase tracking-wider block font-semibold">
              Xəbərdarlıq
            </span>
            <span className="text-xl font-black font-mono text-amber-400">{warningCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-gray-500 flex items-center mr-1">
            <Filter className="w-3.5 h-3.5 mr-1" /> Dərəcə:
          </span>
          <button
            onClick={() => setSeverityFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              severityFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Hamısı ({anomalies.length})
          </button>
          <button
            onClick={() => setSeverityFilter('critical')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1 ${
              severityFilter === 'critical'
                ? 'bg-rose-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <AlertCircle className="w-3 h-3 text-rose-500" />
            <span>Kritik ({criticalCount})</span>
          </button>
          <button
            onClick={() => setSeverityFilter('warning')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1 ${
              severityFilter === 'warning'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span>Xəbərdarlıq ({warningCount})</span>
          </button>
        </div>

        {/* Type select */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Növ:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2.5 py-1 bg-white"
          >
            <option value="all">Bütün Növlər</option>
            <option value="discount">Endirimlər</option>
            <option value="return">Qaytarmalar</option>
            <option value="cash_variance">Kassa Fərqi</option>
            <option value="stock_adjustment">Silinmələr</option>
          </select>
        </div>
      </div>

      {/* Anomalies List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-gray-400">Yüklənir...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 space-y-2">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
          <h3 className="text-sm font-bold text-gray-700">Heç bir anomaliya aşkarlanmadı</h3>
          <p className="text-xs text-gray-400">Bütün əməliyyatlar icazəli limitlər daxilindədir.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <AnomalyCard key={item.id} anomaly={item} />
          ))}
        </div>
      )}
    </div>
  );
};
