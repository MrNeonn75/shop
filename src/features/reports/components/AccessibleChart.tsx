import React, { useState } from 'react';
import { BarChart2, Table as TableIcon, Eye } from 'lucide-react';

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

const toNum = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const toStr = (v: unknown, fallback: string = ''): string => (v != null ? String(v) : fallback);

interface AccessibleChartProps {
  title?: string;
  chartType?: 'bar' | 'line' | 'pie' | 'heatmap' | 'table';
  data: Array<Record<string, unknown>>;
  xAxisKey?: string;
  series?: SeriesConfig[];
}

export const AccessibleChart: React.FC<AccessibleChartProps> = ({
  title,
  chartType = 'bar',
  data,
  xAxisKey = 'label',
  series,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual');

  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 text-center text-gray-500">
        <BarChart2 className="w-10 h-10 mx-auto text-gray-300 mb-2" />
        <p className="text-sm font-medium">Qrafik üçün məlumat yoxdur</p>
      </div>
    );
  }

  // Derive keys if not explicitly passed
  const sample = data[0];
  const keys = Object.keys(sample).filter((k) => k !== xAxisKey);
  const activeSeries: SeriesConfig[] =
    series && series.length > 0
      ? series
      : keys.map((k, idx) => {
          const colors = [
            'var(--chart-1)',
            'var(--chart-2)',
            'var(--chart-3)',
            'var(--chart-4)',
            'var(--chart-5)',
          ];
          return {
            key: k,
            label: k,
            color: colors[idx % colors.length],
          };
        });

  // Calculate max value for scaling
  let maxValue = 1;
  data.forEach((row) => {
    activeSeries.forEach((s) => {
      const val = toNum(row[s.key]);
      if (val > maxValue) maxValue = val;
    });
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}

        {/* Accessibility Alternative Toggle */}
        <div className="flex items-center space-x-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200 ml-auto">
          <button
            onClick={() => setViewMode('visual')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center space-x-1.5 ${
              viewMode === 'visual'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={viewMode === 'visual'}
          >
            <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Qrafik</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center space-x-1.5 ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={viewMode === 'table'}
            title="Əlçatanlıq üçün rəqəmsal cədvəl alternativi"
          >
            <TableIcon className="w-3.5 h-3.5 text-emerald-600" />
            <span>Cədvəl Alternativi</span>
          </button>
        </div>
      </div>

      {/* Series Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {activeSeries.map((s) => (
          <div key={s.key} className="flex items-center space-x-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="text-gray-700 font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Visual Mode Rendering */}
      {viewMode === 'visual' ? (
        <div className="pt-2">
          {chartType === 'heatmap' ? (
            // Heatmap View
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="p-2 border border-gray-200">Saat / Gün</th>
                    {keys.map((k) => (
                      <th key={k} className="p-2 border border-gray-200 text-center">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, rIdx) => (
                    <tr key={rIdx}>
                      <td className="p-2 border border-gray-200 font-semibold text-gray-800 bg-gray-50">
                        {toStr(row[xAxisKey] || row.hour, `Sətir ${rIdx + 1}`)}
                      </td>
                      {keys.map((k) => {
                        const val = toNum(row[k]);
                        const intensity = Math.min(Math.round((val / maxValue) * 100), 100);
                        const bgStyle = `rgba(79, 70, 229, ${Math.max(intensity / 100, 0.08)})`;
                        const textColor = intensity > 50 ? 'text-white' : 'text-gray-900';
                        return (
                          <td
                            key={k}
                            className={`p-2 border border-gray-200 text-center font-mono font-medium ${textColor}`}
                            style={{ backgroundColor: bgStyle }}
                          >
                            {val.toLocaleString('az-AZ')} ₼
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // Responsive Clean Bar / Column Chart
            <div className="space-y-3 pt-1">
              {data.map((row, rIdx) => {
                const label = toStr(row[xAxisKey] || row.category || row.branch || row.label, `Sətir ${rIdx + 1}`);
                return (
                  <div key={rIdx} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600 font-medium">
                      <span>{label}</span>
                      <span className="font-mono text-gray-800">
                        {activeSeries
                          .map((s) => `${s.label}: ${toNum(row[s.key]).toLocaleString('az-AZ')}`)
                          .join(' | ')}
                      </span>
                    </div>
                    <div className="flex h-5 bg-gray-100 rounded-md overflow-hidden gap-1 p-0.5">
                      {activeSeries.map((s) => {
                        const val = toNum(row[s.key]);
                        const pct = Math.min((val / maxValue) * 100, 100);
                        return (
                          <div
                            key={s.key}
                            className="h-full rounded transition-all duration-500 relative group"
                            style={{
                              width: `${Math.max(pct, 2)}%`,
                              backgroundColor: s.color,
                            }}
                            title={`${s.label}: ${val.toLocaleString('az-AZ')}`}
                          >
                            <span className="sr-only">
                              {s.label}: {val}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Table Alternative Mode for Accessibility (Screen Readers / Precision analysis)
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <caption className="sr-only">{title || 'Qrafikin cədvəl alternativi'}</caption>
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  {xAxisKey.toUpperCase()}
                </th>
                {activeSeries.map((s) => (
                  <th key={s.key} scope="col" className="px-4 py-2.5 text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-gray-50/80">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {toStr(row[xAxisKey] || row.category || row.branch || row.label, `Göstərici ${rIdx + 1}`)}
                  </td>
                  {activeSeries.map((s) => {
                    const val = toNum(row[s.key]);
                    return (
                      <td key={s.key} className="px-4 py-2.5 text-right font-mono text-gray-800">
                        {val.toLocaleString('az-AZ')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Screen-reader descriptive footnote */}
      <div className="flex items-center text-[11px] text-gray-400 pt-1">
        <Eye className="w-3.5 h-3.5 mr-1 text-gray-400" />
        <span>Qrafik rəngləri rəng korluğu standartlarına uyğunlaşdırılıb və cədvəl alternativi aktivdir.</span>
      </div>
    </div>
  );
};

