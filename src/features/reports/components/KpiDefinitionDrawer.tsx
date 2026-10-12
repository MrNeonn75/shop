import React from 'react';
import { X, HelpCircle, BookOpen, Database, Calculator, Info } from 'lucide-react';
import { EXTENDED_KPI_REGISTRY, ExtendedKpiDefinition } from '../constants/extendedKpis';

interface KpiDefinitionDrawerProps {
  kpiId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const KpiDefinitionDrawer: React.FC<KpiDefinitionDrawerProps> = ({
  kpiId,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !kpiId) return null;

  const kpi: ExtendedKpiDefinition | undefined = EXTENDED_KPI_REGISTRY[kpiId];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="kpi-drawer-title" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md bg-white shadow-xl flex flex-col">
          {/* Header */}
          <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <h2 id="kpi-drawer-title" className="text-lg font-semibold">
                Hesablama Qaydası
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-md text-gray-300 hover:text-white focus:outline-none"
              aria-label="Bağla"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {kpi ? (
              <>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 mb-2">
                    {kpi.category.toUpperCase()} • {kpi.unit.toUpperCase()}
                  </span>
                  <h3 className="text-xl font-bold text-gray-900">{kpi.nameAz}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Kod: <code className="bg-gray-100 px-1 py-0.5 rounded">{kpiId}</code></p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center mb-2">
                    <Info className="w-4 h-4 mr-1 text-slate-600" /> Tərif və Məqsəd
                  </h4>
                  <p className="text-sm text-slate-800 leading-relaxed">{kpi.description}</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider flex items-center mb-2">
                    <Calculator className="w-4 h-4 mr-1 text-blue-600" /> Dəqiq Riyazi Formula
                  </h4>
                  <div className="bg-white p-3 rounded border border-blue-100 font-mono text-sm text-blue-900 overflow-x-auto">
                    {kpi.formulaText}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                    <Database className="w-4 h-4 mr-1 text-gray-600" /> Məlumat Mənbələri
                  </h4>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-800 font-mono">
                    {kpi.dataSource}
                  </div>
                </div>

                {kpi.isSensitive && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-1">
                    <span className="font-bold flex items-center">
                      <HelpCircle className="w-4 h-4 mr-1 text-amber-600" /> Həssas Maliyyə Göstəricisi:
                    </span>
                    <p className="leading-relaxed">
                      Bu göstərici şirkətin maya dəyəri və mənfəət məlumatlarını əks etdirdiyi üçün yalnız icazəsi olan vəzifələrə (Maliyyəçi, Baş Menecer) açıqdır.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <HelpCircle className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                <p>Bu göstərici üçün reyestrdə açıqlama tapılmadı.</p>
                <p className="text-xs text-gray-400 mt-1">ID: {kpiId}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
            >
              Bağla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

