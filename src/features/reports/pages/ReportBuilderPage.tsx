import React, { useState, useEffect } from 'react';
import {
  Wand2,
  CheckSquare,
  Square,
  Play,
  Save,
  Table,
  Shield,
  Layers,
} from 'lucide-react';
import { useSessionStore } from '../../../shared/stores/sessionStore';
import { reportsRepository } from '../../../shared/adapters';
import {
  ReportDatasetId,
  ReportBuilderField,
  CustomReportConfig,
  ReportQueryResult,
} from '../types';
import {
  DATASET_METADATA,
  getPermittedFieldsForDataset,
} from '../utils/reportBuilderEngine';

export const ReportBuilderPage: React.FC = () => {
  const { user } = useSessionStore();

  const [selectedDataset, setSelectedDataset] = useState<ReportDatasetId>('sales_lines');
  const [reportTitle, setReportTitle] = useState('Fərdi Satış və Gəlir Təhlili');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(['branchName', 'categoryName']);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>(['quantitySold', 'netRevenueAzn']);

  const [availableFields, setAvailableFields] = useState<ReportBuilderField[]>([]);
  const [queryResult, setQueryResult] = useState<ReportQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Update permitted fields when dataset or user changes
  useEffect(() => {
    const fields = getPermittedFieldsForDataset(selectedDataset, user?.permissions || []);
    setAvailableFields(fields);

    // Filter out selections that might no longer be valid/permitted
    const fieldIds = new Set(fields.map((f) => f.id));
    setSelectedDimensions((prev) => prev.filter((id) => fieldIds.has(id)));
    setSelectedMeasures((prev) => prev.filter((id) => fieldIds.has(id)));
  }, [selectedDataset, user]);

  const toggleDimension = (id: string) => {
    if (selectedDimensions.includes(id)) {
      setSelectedDimensions(selectedDimensions.filter((dim) => dim !== id));
    } else {
      setSelectedDimensions([...selectedDimensions, id]);
    }
  };

  const toggleMeasure = (id: string) => {
    if (selectedMeasures.includes(id)) {
      setSelectedMeasures(selectedMeasures.filter((m) => m !== id));
    } else {
      setSelectedMeasures([...selectedMeasures, id]);
    }
  };

  const handleRunQuery = async () => {
    if (selectedDimensions.length === 0 && selectedMeasures.length === 0) return;

    try {
      setLoading(true);
      const config: CustomReportConfig = {
        id: `custom_${Date.now()}`,
        title: reportTitle,
        dataset: selectedDataset,
        selectedDimensions,
        selectedMeasures,
        isShared: true,
        createdBy: user?.name || 'Menecer',
        createdAt: new Date().toISOString(),
      };

      const res = await reportsRepository.executeCustomReport(config, {});
      setQueryResult(res);
    } catch (err) {
      console.error('Failed to run custom report query:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReport = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const dimensions = availableFields.filter((f) => f.type === 'dimension');
  const measures = availableFields.filter((f) => f.type === 'measure');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider flex items-center">
              <Wand2 className="w-3 h-3 mr-1" /> No-Code Hesabat Generatoru
            </span>
            <span className="text-xs text-gray-400">• SQL Təhlükəsizliyi Qorunur</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Fərdi Hesabat Qurucusu</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            İcazə verilmiş datasetlərdən ölçüləri və aqreqasiya göstəricilərini seçərək çevik analitik cədvəllər yaradın.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSaveReport}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl border border-gray-300 shadow-2xs flex items-center space-x-1.5 transition-colors"
          >
            <Save className="w-3.5 h-3.5 text-gray-500" />
            <span>Şablonu Saxla</span>
          </button>
          <button
            onClick={handleRunQuery}
            disabled={loading || (selectedDimensions.length === 0 && selectedMeasures.length === 0)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Sorğunu İcra Et</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
          <Shield className="w-4 h-4 text-emerald-600" />
          <span>Hesabat şablonu uğurla saxlanıldı və digər menecerlər üçün paylaşıldı.</span>
        </div>
      )}

      {/* Grid: Left Configuration Panel, Right Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Builder Controls */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-5">
          {/* 1. Report Title & Dataset */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Hesabatın Adı
              </label>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                İcazəli Məlumat Bazası (Dataset)
              </label>
              <select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value as ReportDatasetId)}
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white"
              >
                {Object.values(DATASET_METADATA).map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.titleAz}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                {DATASET_METADATA[selectedDataset]?.descriptionAz}
              </p>
            </div>
          </div>

          {/* 2. Dimensions Checklist */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Ölçülər (Qruplaşdırma)
              </label>
              <span className="text-[10px] text-gray-400">
                {selectedDimensions.length} seçildi
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {dimensions.map((dim) => {
                const checked = selectedDimensions.includes(dim.id);
                return (
                  <button
                    key={dim.id}
                    type="button"
                    onClick={() => toggleDimension(dim.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs text-left transition-colors ${
                      checked
                        ? 'border-indigo-300 bg-indigo-50/50 text-indigo-900 font-medium'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                      <span>{dim.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 uppercase">
                      {dim.dataType}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Measures Checklist */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Göstəricilər (Hesablamalar)
              </label>
              <span className="text-[10px] text-gray-400">
                {selectedMeasures.length} seçildi
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {measures.map((m) => {
                const checked = selectedMeasures.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMeasure(m.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs text-left transition-colors ${
                      checked
                        ? 'border-indigo-300 bg-indigo-50/50 text-indigo-900 font-medium'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                      <span>{m.label}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {m.isSensitive && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                          Həssas
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-gray-400 uppercase">
                        {m.dataType}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Execution Output Preview */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-2">
              <Table className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-900">Nəticə Cədvəli (Canlı Önizləmə)</h3>
            </div>
            {queryResult && (
              <span className="text-xs text-gray-500 font-mono">
                {queryResult.tableRows.length} sətir generasiya olundu
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-24 text-center text-xs text-gray-400">
              Aqreqasiya sorğusu icra edilir...
            </div>
          ) : !queryResult ? (
            <div className="py-24 text-center text-gray-400 space-y-2">
              <Layers className="w-12 h-12 mx-auto text-gray-300" />
              <p className="text-xs">
                Ölçüləri və göstəriciləri seçib <strong>"Sorğunu İcra Et"</strong> düyməsinə klikləyin.
              </p>
            </div>
          ) : queryResult.tableRows.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-500">
              Bu parametr kombinasiyası üçün məlumat tapılmadı.
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                  <tr>
                    {selectedDimensions.map((dimId) => {
                      const f = availableFields.find((f) => f.id === dimId);
                      return (
                        <th key={dimId} className="px-4 py-2.5">
                          {f?.label || dimId}
                        </th>
                      );
                    })}
                    {selectedMeasures.map((measureId) => {
                      const f = availableFields.find((f) => f.id === measureId);
                      return (
                        <th key={measureId} className="px-4 py-2.5 text-right">
                          {f?.label || measureId}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {queryResult.tableRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {selectedDimensions.map((dimId) => (
                        <td key={dimId} className="px-4 py-2.5 font-medium text-gray-900">
                          {row[dimId] != null ? String(row[dimId]) : '—'}
                        </td>
                      ))}
                      {selectedMeasures.map((measureId) => (
                        <td key={measureId} className="px-4 py-2.5 text-right font-mono text-gray-800">
                          {typeof row[measureId] === 'number'
                            ? (row[measureId] as number).toLocaleString('az-AZ')
                            : row[measureId] != null
                            ? String(row[measureId])
                            : '0'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
