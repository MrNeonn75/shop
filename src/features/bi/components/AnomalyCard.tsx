import React from 'react';
import { AlertTriangle, AlertCircle, ArrowUpRight, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { AnomalyItem } from '../types';
import { Link } from 'react-router-dom';

interface AnomalyCardProps {
  anomaly: AnomalyItem;
}

export const AnomalyCard: React.FC<AnomalyCardProps> = ({ anomaly }) => {
  const isCritical = anomaly.severity === 'critical';

  const typeLabels: Record<string, string> = {
    discount: 'Qeyri-adi Endirim',
    return: 'Qaytarma Dalğası',
    cash_variance: 'Kassa Fərqi',
    stock_adjustment: 'Silinmə Aktı',
  };

  return (
    <div
      className={`rounded-xl border p-5 transition-all shadow-sm ${
        isCritical
          ? 'bg-rose-50/40 border-rose-200'
          : 'bg-amber-50/40 border-amber-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center space-x-2">
          {isCritical ? (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          )}
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isCritical
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isCritical ? 'Kritik Risk' : 'Xəbərdarlıq'}
              </span>
              <span className="text-xs font-semibold text-gray-500">
                • {typeLabels[anomaly.type] || anomaly.type}
              </span>
            </div>
            <h4 className="text-sm font-bold text-gray-900 mt-1">{anomaly.title}</h4>
          </div>
        </div>

        {anomaly.varianceAzn !== undefined && (
          <div className="text-right">
            <span className="text-xs text-gray-500 block">Kənarlaşma:</span>
            <span
              className={`text-sm font-bold font-mono ${
                isCritical ? 'text-rose-700' : 'text-amber-700'
              }`}
            >
              {anomaly.varianceAzn > 0 ? `+${anomaly.varianceAzn.toFixed(2)}` : anomaly.varianceAzn.toFixed(2)} ₼
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-700 leading-relaxed mb-3">{anomaly.description}</p>

      {/* Detection Criteria & Evidence */}
      <div className="bg-white/80 rounded-lg p-3 border border-gray-200/80 space-y-1.5 text-xs">
        <div className="flex items-center text-gray-600">
          <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
          <span className="font-medium text-gray-700">Aşkarlanma Meyarı:</span>
          <span className="ml-1 text-gray-600">{anomaly.detectionCriteria}</span>
        </div>
        <div className="flex items-center text-gray-500 text-[11px]">
          <span>Məkan: <strong>{anomaly.branchName}</strong></span>
          <span className="mx-2">•</span>
          <span>İcraçı: <strong>{anomaly.actorName}</strong></span>
          <span className="mx-2">•</span>
          <span>Zaman: {anomaly.detectedAt}</span>
        </div>
      </div>

      {/* Footer / Evidence Link */}
      <div className="mt-3 flex items-center justify-between pt-2">
        <div className="flex items-center text-xs text-emerald-700 space-x-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Audit Loquna qeyd edildi</span>
        </div>

        <Link
          to={anomaly.evidenceUrl}
          className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 space-x-1"
        >
          <span>Sübuta və Əməliyyata Bax</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};

