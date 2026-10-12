import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  Star,
  Clock,
  Layers,
  ArrowRight,
  PlusCircle,
  CalendarCheck,
  ShieldAlert,
} from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { hasPermission } from '../../../shared/utils/permissions';
import { reportsRepository } from '../../../shared/adapters';
import { ReportDefinition, ReportCategory } from '../types';

const CATEGORY_TABS: Array<{ id: ReportCategory | 'all' | 'favorites'; label: string; count?: number }> = [
  { id: 'all', label: 'Bütün Hesabatlar' },
  { id: 'favorites', label: 'Sevimlilər' },
  { id: 'sales', label: 'Satış' },
  { id: 'inventory', label: 'Anbar' },
  { id: 'purchasing', label: 'Satınalma' },
  { id: 'finance', label: 'Maliyyə' },
  { id: 'hr', label: 'HR' },
  { id: 'marketing', label: 'Marketinq' },
];

export const ReportsCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useSessionStore();
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ReportCategory | 'all' | 'favorites'>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rep_favorites') || '[]');
    } catch {
      return [];
    }
  });
  const [recentReports, setRecentReports] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('rep_recent') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const catalog = await reportsRepository.getReportsCatalog();
      setReports(catalog);
    } catch (err) {
      console.error('Failed to load reports catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const updated = favorites.includes(reportId)
      ? favorites.filter((id) => id !== reportId)
      : [...favorites, reportId];
    setFavorites(updated);
    localStorage.setItem('rep_favorites', JSON.stringify(updated));
  };

  const handleOpenReport = (reportId: string) => {
    // Add to recent
    const updatedRecent = [reportId, ...recentReports.filter((id) => id !== reportId)].slice(0, 5);
    setRecentReports(updatedRecent);
    localStorage.setItem('rep_recent', JSON.stringify(updatedRecent));
    navigate(`/reports/view/${reportId}`);
  };

  // Filter reports
  const filteredReports = reports.filter((r) => {
    // Permission check
    const isAllowed = hasPermission(user, r.requiredPermissions, false);
    if (!isAllowed) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        r.azTitle.toLowerCase().includes(q) ||
        r.azDescription.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Category filter
    if (activeCategory === 'favorites') {
      return favorites.includes(r.id);
    }
    if (activeCategory !== 'all') {
      return r.category === activeCategory;
    }

    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Quick Links */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
              Mərkəzi Hesabat Reyestri
            </span>
            <span className="text-xs text-slate-400">• Real-vaxt Analitika</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Hesabatlar Mərkəzi</h1>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Pərakəndə şəbəkənin satış, anbar hərəkətləri, maya dəyəri, idarəetmə mənfəəti və əməkdaş fəaliyyətini əks etdirən rəsmi idarəetmə hesabatları.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/reports/builder"
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Fərdi Hesabat Qurucusu</span>
          </Link>
          <Link
            to="/reports/scheduled"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center space-x-1.5 border border-slate-700 transition-colors"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Cədvəl Çatdırılmaları</span>
          </Link>
        </div>
      </div>

      {/* Search and Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Hesabat adı, təsviri və ya kodu ilə axtarış..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto py-1">
          {CATEGORY_TABS.map((tab) => {
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center space-x-1 ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {tab.id === 'favorites' && <Star className={`w-3.5 h-3.5 ${active ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recently Viewed Strip */}
      {recentReports.length > 0 && activeCategory === 'all' && !search && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Son Baxılmış Hesabatlar</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentReports.map((id) => {
              const rep = reports.find((r) => r.id === id);
              if (!rep) return null;
              return (
                <button
                  key={id}
                  onClick={() => handleOpenReport(id)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 hover:border-indigo-400 hover:text-indigo-600 flex items-center space-x-1.5 shadow-2xs transition-all"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{rep.azTitle}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reports Grid */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-xs font-medium">
          Hesabatlar bazadan yüklənir...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 space-y-2">
          <Layers className="w-12 h-12 mx-auto text-gray-300" />
          <h3 className="text-sm font-bold text-gray-700">Uyğun hesabat tapılmadı</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Axtarış meyarlarını dəyişin və ya vəzifənizə aid icazələri yoxlayın.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => {
            const isFav = favorites.includes(report.id);
            return (
              <div
                key={report.id}
                onClick={() => handleOpenReport(report.id)}
                className="bg-white rounded-xl border border-gray-200 p-5 shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between group relative"
              >
                <div>
                  {/* Card Header: Code, Badges, Favorite */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {report.code}
                    </span>

                    <div className="flex items-center space-x-1.5">
                      {report.isSensitive && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1"
                          title="Maya dəyəri və mənfəət göstəriciləri ehtiva edir"
                        >
                          <ShieldAlert className="w-3 h-3 text-amber-600" />
                          <span>Maya / Marja</span>
                        </span>
                      )}

                      <button
                        onClick={(e) => toggleFavorite(report.id, e)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-amber-500 transition-colors"
                        title={isFav ? 'Sevimlilərdən çıxar' : 'Sevimlilərə əlavə et'}
                        aria-label="Sevimlilərə əlavə et"
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors leading-snug mb-1.5">
                    {report.azTitle}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                    {report.azDescription}
                  </p>
                </div>

                {/* Card Footer: Metadata and open link */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span className="capitalize text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {report.category}
                  </span>
                  <span className="text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center space-x-1">
                    <span>Hesabatı Aç</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
