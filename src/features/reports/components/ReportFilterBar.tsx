import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Building2,
  Filter,
  Share2,
  Bookmark,
  Check,
  RefreshCw,
} from 'lucide-react';
import { ReportFilterConfig, ReportFilterState } from '../types';
import { serializeReportFiltersToUrl, parseReportFiltersFromUrl } from '../utils/reportBuilderEngine';

interface ReportFilterBarProps {
  filterConfig: ReportFilterConfig;
  onFilterChange: (filters: ReportFilterState) => void;
  lastGeneratedTime?: string;
  allowedBranchIds?: string[];
  activeCogsMethod?: string;
}

const DATE_PRESETS = [
  { id: 'today', label: 'Bu gün' },
  { id: 'yesterday', label: 'Dünən' },
  { id: 'this_week', label: 'Bu həftə' },
  { id: 'this_month', label: 'Bu ay' },
  { id: 'last_month', label: 'Keçən ay' },
  { id: 'this_year', label: 'Bu il' },
  { id: 'custom', label: 'Fərdi dövr' },
];

const ALL_BRANCHES = [
  { id: 'b1', name: 'Baş Filial (Nizami)' },
  { id: 'b2', name: 'Gənclik Mall Filialı' },
  { id: 'b3', name: '28 Mall Filialı' },
  { id: 'b4', name: 'Sumqayıt Filialı' },
];

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  filterConfig,
  onFilterChange,
  lastGeneratedTime,
  allowedBranchIds,
  activeCogsMethod,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL or default
  const urlFilters = parseReportFiltersFromUrl(searchParams.toString());
  const [filters, setFilters] = useState<ReportFilterState>({
    datePreset: urlFilters.datePreset || filterConfig.defaultDatePreset || 'this_month',
    startDate: urlFilters.startDate || '2026-10-01',
    endDate: urlFilters.endDate || '2026-10-12',
    branchIds: urlFilters.branchIds || (allowedBranchIds && allowedBranchIds.length > 0 ? allowedBranchIds : ['b1']),
    categoryIds: urlFilters.categoryIds || [],
    thresholdDays: urlFilters.thresholdDays || filterConfig.defaultThresholdDays || 90,
    paymentMethod: urlFilters.paymentMethod || '',
  });

  const [copied, setCopied] = useState(false);
  const [savedPresets, setSavedPresets] = useState<string[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Filter available branches by user permissions
  const availableBranches = ALL_BRANCHES.filter(
    (b) => !allowedBranchIds || allowedBranchIds.length === 0 || allowedBranchIds.includes(b.id)
  );

  // Sync initial filters with parent
  useEffect(() => {
    onFilterChange(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePresetChange = (presetId: string) => {
    const today = '2026-10-12';
    let start = '2026-10-01';
    let end = today;

    if (presetId === 'today') {
      start = today;
      end = today;
    } else if (presetId === 'yesterday') {
      start = '2026-10-11';
      end = '2026-10-11';
    } else if (presetId === 'this_week') {
      start = '2026-10-06';
      end = today;
    } else if (presetId === 'this_month') {
      start = '2026-10-01';
      end = today;
    } else if (presetId === 'last_month') {
      start = '2026-09-01';
      end = '2026-09-30';
    } else if (presetId === 'this_year') {
      start = '2026-01-01';
      end = today;
    }

    const newFilters: ReportFilterState = {
      ...filters,
      datePreset: presetId,
      startDate: start,
      endDate: end,
    };
    updateFilters(newFilters);
  };

  const handleBranchToggle = (branchId: string) => {
    const current = filters.branchIds || [];
    let updated: string[];
    if (current.includes(branchId)) {
      updated = current.filter((id) => id !== branchId);
      if (updated.length === 0) {
        // Prevent empty selection if possible, keep at least one
        updated = [branchId];
      }
    } else {
      updated = [...current, branchId];
    }

    const newFilters: ReportFilterState = {
      ...filters,
      branchIds: updated,
    };
    updateFilters(newFilters);
  };

  const handleSelectAllBranches = () => {
    const allIds = availableBranches.map((b) => b.id);
    const newFilters: ReportFilterState = {
      ...filters,
      branchIds: allIds,
    };
    updateFilters(newFilters);
  };

  const updateFilters = (newFilters: ReportFilterState) => {
    setFilters(newFilters);
    onFilterChange(newFilters);

    // Update URL query params without reloading
    const serialized = serializeReportFiltersToUrl(newFilters as unknown as Record<string, unknown>);
    setSearchParams(new URLSearchParams(serialized), { replace: true });
  };

  const handleShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const key = `rep_preset_${newPresetName.trim()}`;
    localStorage.setItem(key, JSON.stringify(filters));
    setSavedPresets([...savedPresets, newPresetName.trim()]);
    setNewPresetName('');
    setShowSaveModal(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-4">
      {/* Top bar: Date presets, actions, share */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        {/* Date presets */}
        {filterConfig.supportedFilters.includes('dateRange') && (
          <div className="flex items-center space-x-1 overflow-x-auto py-1">
            <span className="text-xs font-semibold text-gray-500 mr-2 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1" /> Dövr:
            </span>
            {DATE_PRESETS.map((p) => {
              const active = filters.datePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Right side utilities: Share, presets, timestamp */}
        <div className="flex items-center space-x-2">
          {lastGeneratedTime && (
            <span className="text-xs text-gray-500 flex items-center bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
              <RefreshCw className="w-3 h-3 mr-1 text-gray-400" />
              Yeniləndi: <strong className="ml-1 text-gray-700">{lastGeneratedTime}</strong>
            </span>
          )}

          <button
            onClick={handleShareLink}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
            title="Filtrli keçidi kopyala"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                <span className="text-emerald-600">Kopyalandı!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 mr-1 text-gray-500" />
                Keçidi Paylaş
              </>
            )}
          </button>

          <button
            onClick={() => setShowSaveModal(true)}
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
            title="Bu filtri yadda saxla"
          >
            <Bookmark className="w-3.5 h-3.5 mr-1 text-gray-500" />
            Şablon
          </button>
        </div>
      </div>

      {/* Second row: Custom date pickers & Branch selector */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Custom date range fields if custom selected */}
        {filters.datePreset === 'custom' && filterConfig.supportedFilters.includes('dateRange') && (
          <div className="md:col-span-4 flex items-center space-x-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => updateFilters({ ...filters, startDate: e.target.value })}
              className="text-xs border-gray-300 rounded p-1 w-full"
            />
            <span className="text-xs text-gray-400">-</span>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => updateFilters({ ...filters, endDate: e.target.value })}
              className="text-xs border-gray-300 rounded p-1 w-full"
            />
          </div>
        )}

        {/* Branch selection */}
        {filterConfig.supportedFilters.includes('branches') && (
          <div className="md:col-span-8 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-500 mr-1 flex items-center">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Filiallar:
            </span>
            <button
              onClick={handleSelectAllBranches}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                filters.branchIds?.length === availableBranches.length
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Hamısı ({availableBranches.length})
            </button>
            {availableBranches.map((branch) => {
              const selected = filters.branchIds?.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  onClick={() => handleBranchToggle(branch.id)}
                  className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors flex items-center space-x-1 ${
                    selected
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span>{branch.name}</span>
                  {selected && <Check className="w-3 h-3 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* COGS Notice if active */}
      {activeCogsMethod && (
        <div className="flex items-center justify-between bg-blue-50/60 border border-blue-200/60 rounded-lg px-3 py-1.5 text-xs text-blue-900">
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Tətbiq edilən maya metodologiyası:</span>
            <strong className="font-semibold text-blue-950">{activeCogsMethod}</strong>
          </div>
          <span className="text-[11px] text-blue-600">Vergi Məcəlləsi və BH Mühasibat Siyasəti</span>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white p-5 rounded-xl shadow-xl max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Filtr Şablonunu Yadda Saxla</h3>
            <p className="text-xs text-gray-500">
              Cari filial və tarix seçimlərinizi adlandıraraq sonradan bir kliklə tətbiq edə bilərsiniz.
            </p>
            <input
              type="text"
              placeholder="Məs: Həftəlik Nizami Filialı"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                İmtina
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Yadda saxla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

