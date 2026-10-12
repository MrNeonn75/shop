import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Printer,
  HelpCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { hasPermission } from '../../../shared/utils/permissions';
import { reportsRepository } from '../../../shared/adapters';
import { ReportDefinition, ReportFilterState, ReportQueryResult } from '../types';
import { ReportFilterBar } from '../components/ReportFilterBar';
import { AccessibleChart } from '../components/AccessibleChart';
import { KpiDefinitionDrawer } from '../components/KpiDefinitionDrawer';
import { ReportExportModal } from '../components/ReportExportModal';
import { AsyncReportProgress } from '../components/AsyncReportProgress';

export const ReportViewerPage: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const { user } = useSessionStore();

  const [definition, setDefinition] = useState<ReportDefinition | null>(null);
  const [queryResult, setQueryResult] = useState<ReportQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReportFilterState>({});

  // Modals & Drawers
  const [activeKpiDrawerId, setActiveKpiDrawerId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeAsyncJobId, setActiveAsyncJobId] = useState<string | null>(null);

  useEffect(() => {
    if (reportId) {
      loadReportDefinition(reportId);
    }
  }, [reportId]);

  const loadReportDefinition = async (id: string) => {
    try {
      setLoading(true);
      const def = await reportsRepository.getReportById(id);
      setDefinition(def);
      if (def) {
        // Initial execution with defaults
        const initialFilters: ReportFilterState = {
          datePreset: def.filterConfig.defaultDatePreset || 'this_month',
          branchIds: user?.allowedBranchIds || ['b1'],
        };
        setFilters(initialFilters);
        const res = await reportsRepository.executeReport(id, initialFilters);
        setQueryResult(res);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = async (newFilters: ReportFilterState) => {
    if (!reportId) return;
    setFilters(newFilters);
    try {
      setLoading(true);
      const res = await reportsRepository.executeReport(reportId, newFilters);
      setQueryResult(res);
    } catch (err) {
      console.error('Failed to execute report with filters:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAsyncGeneration = async () => {
    if (!reportId) return;
    try {
      const { jobId } = await reportsRepository.startAsyncReportGeneration(reportId, filters);
      setActiveAsyncJobId(jobId);
    } catch (err) {
      console.error('Failed to start async generation:', err);
    }
  };

  if (!loading && !definition) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-gray-900">Hesabat Tapılmadı</h2>
        <p className="text-xs text-gray-500">Göstərilən ID ilə hesabat tərifləri sistemdə mövcud deyil: {reportId}</p>
        <Link
          to="/reports"
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
        >
          Hesabatlar Siyahısına Qayıt
        </Link>
      </div>
    );
  }

  // Permission check
  const isAllowed = definition ? hasPermission(user, definition.requiredPermissions, false) : true;
  if (!isAllowed) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-gray-900">Giriş İcazəsi Yoxdur</h2>
        <p className="text-xs text-gray-500">
          Bu hesabatı ({definition?.azTitle}) görmək üçün vəzifənizə aid hüquqlar kifayət etmir.
        </p>
        <Link
          to="/reports"
          className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
        >
          Kataloqa Qayıt
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header: Navigation & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link
            to="/reports"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            title="Kataloqa qayıt"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                {definition?.code}
              </span>
              <span className="text-xs text-gray-400">• {definition?.category.toUpperCase()}</span>
              {queryResult?.isDemo && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  DEMO VERİLƏNLƏR
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">{definition?.azTitle}</h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleStartAsyncGeneration}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1 border border-slate-300 transition-colors"
            title="Çoxsaylı filiallar və böyük dövrlər üçün fon generasiyası"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Asinxron Generasiya</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg flex items-center space-x-1 border border-gray-300 shadow-2xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-gray-500" />
            <span>Çap Et</span>
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>İxrac Et</span>
          </button>
        </div>
      </div>

      {/* Async Progress Notification if running */}
      {activeAsyncJobId && (
        <AsyncReportProgress
          jobId={activeAsyncJobId}
          onComplete={() => setActiveAsyncJobId(null)}
          onCancel={() => setActiveAsyncJobId(null)}
        />
      )}

      {/* Filter Bar */}
      {definition && (
        <ReportFilterBar
          filterConfig={definition.filterConfig}
          onFilterChange={handleFilterChange}
          lastGeneratedTime={queryResult?.generatedAt}
          allowedBranchIds={user?.allowedBranchIds}
          activeCogsMethod={definition.cogsMethodNotice ? queryResult?.activeCogsMethod : undefined}
        />
      )}

      {/* Missing Data / Incomputable Rationale Notice if any */}
      {queryResult?.missingDataReasons && queryResult.missingDataReasons.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
          <strong className="font-semibold flex items-center">
            <AlertCircle className="w-4 h-4 mr-1 text-amber-600" /> Bəzi Göstəricilər Hesablanmadı:
          </strong>
          <ul className="list-disc list-inside space-y-0.5 text-amber-800">
            {queryResult.missingDataReasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI Cards Strip */}
      {queryResult?.kpis && queryResult.kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {queryResult.kpis.map((kpi) => (
            <div
              key={kpi.id}
              className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs space-y-1.5 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-medium text-gray-500 leading-tight">
                  {kpi.label}
                </span>
                {kpi.kpiDefId && (
                  <button
                    onClick={() => setActiveKpiDrawerId(kpi.kpiDefId!)}
                    className="text-gray-400 hover:text-indigo-600 p-0.5"
                    title="Hesablama qaydasına bax"
                    aria-label={`${kpi.label} hesablama qaydası`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div>
                {kpi.isComputable ? (
                  <span className="text-base font-bold text-gray-900 font-mono tracking-tight block">
                    {kpi.formattedValue}
                  </span>
                ) : (
                  <span
                    className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded inline-block"
                    title={kpi.missingReason || 'Məlumat çatışmır'}
                  >
                    Hesablanmayıb
                  </span>
                )}

                {kpi.changePercent !== undefined && (
                  <div className="flex items-center text-[10px] font-semibold mt-1">
                    {kpi.changePercent >= 0 ? (
                      <span className="text-emerald-600 flex items-center">
                        <TrendingUp className="w-3 h-3 mr-0.5" />
                        +{kpi.changePercent}%
                      </span>
                    ) : (
                      <span className="text-rose-600 flex items-center">
                        <TrendingDown className="w-3 h-3 mr-0.5" />
                        {kpi.changePercent}%
                      </span>
                    )}
                    <span className="text-gray-400 ml-1">əvvəlki dövr</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accessible Visual Chart */}
      {queryResult?.chartData && queryResult.chartData.length > 0 && (
        <AccessibleChart
          title={`${definition?.azTitle} — Vizual Analiz`}
          chartType={definition?.defaultChartType || 'bar'}
          data={queryResult.chartData}
        />
      )}

      {/* Main Tabular Data Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden space-y-2">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Ətraflı Məlumat Cədvəli</h3>
            <span className="text-xs text-gray-400">
              ({queryResult?.totalCount || 0} sətir)
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-gray-400">Məlumatlar yenilənir...</div>
        ) : !queryResult || queryResult.tableRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400">
            Seçilmiş filtrlər üzrə məlumat tapılmadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  {definition?.columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {queryResult.tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                    {definition?.columns.map((col) => {
                      const val = row[col.key];
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 ${
                            col.align === 'right'
                              ? 'text-right font-mono'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          } ${col.isSensitive ? 'font-semibold text-slate-900' : 'text-gray-700'}`}
                        >
                          {val !== undefined && val !== null ? String(val) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPI Definition Drawer */}
      <KpiDefinitionDrawer
        kpiId={activeKpiDrawerId}
        isOpen={Boolean(activeKpiDrawerId)}
        onClose={() => setActiveKpiDrawerId(null)}
      />

      {/* Export Modal */}
      {definition && (
        <ReportExportModal
          reportId={definition.id}
          reportTitle={definition.azTitle}
          filters={filters}
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
};
