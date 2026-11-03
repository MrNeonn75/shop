import React, { useEffect, useState } from 'react';
import { FiscalStatus } from '../types';
import { complianceRepository } from '../../../shared/adapters';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { AlertTriangle, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';

export const FiscalStatusWidget: React.FC = () => {
  const [fiscalStatus, setFiscalStatus] = useState<FiscalStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);

  const fetchStatus = () => {
    complianceRepository.getFiscalStatus().then((res) => {
      setFiscalStatus(res);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!fiscalStatus) return null;

  const handleReconcile = async () => {
    try {
      setIsReconciling(true);
      setReconcileResult(null);
      const res = await complianceRepository.reconcileFiscal();
      setReconcileResult(res.details || 'Uzlaşma uğurla başa çatdı.');
      fetchStatus();
    } catch (err: any) {
      setReconcileResult(err.message || 'Fiskal status yoxlanılarkən xəta baş verdi');
    } finally {
      setIsReconciling(false);
    }
  };

  const isPending = (fiscalStatus.state as any) === 'PENDING_FISCAL';
  const isUnknown = (fiscalStatus.state as any) === 'FISCAL_UNKNOWN';

  const getChipStyle = () => {
    if (isUnknown) return 'bg-rose-950/80 text-rose-300 border-rose-800 animate-pulse';
    if (isPending) return 'bg-blue-950/80 text-blue-300 border-blue-800 animate-pulse';
    if (fiscalStatus.status === 'ACTIVE') return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
    if (fiscalStatus.status === 'UNAVAILABLE') return 'bg-amber-950/80 text-amber-300 border-amber-800';
    return 'bg-zinc-900 text-zinc-400 border-zinc-800';
  };

  const getStatusLabel = () => {
    if (isUnknown) return 'Qeyri-müəyyən';
    if (isPending) return 'Gözləmədə';
    if (fiscalStatus.status === 'ACTIVE') return 'Aktiv';
    if (fiscalStatus.status === 'UNAVAILABLE') return 'Əlçatmaz';
    return 'Qurulmayıb';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors ${getChipStyle()}`}
        title={`Fiskal Kassa Statusu: ${getStatusLabel()} (${fiscalStatus.operatorName || 'E-Kassa'})`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            fiscalStatus.status === 'ACTIVE' && !isUnknown
              ? 'bg-emerald-400'
              : fiscalStatus.status === 'UNAVAILABLE'
              ? 'bg-amber-400'
              : isUnknown
              ? 'bg-rose-400'
              : 'bg-zinc-500'
          }`}
        />
        <span className="hidden sm:inline text-zinc-400">Fiskal:</span>
        <span className="font-semibold">{getStatusLabel()}</span>
        {fiscalStatus.isDemo && (
          <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1 rounded">
            DEMO
          </span>
        )}
      </button>

      {/* Fiscal Diagnostics & Reconcile Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setReconcileResult(null);
        }}
        title="Fiskal Kassa və E-Kassa Şlüz Diaqnostikası"
        size="md"
      >
        <div className="space-y-4 text-xs text-zinc-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Kassa Aparatı Cihazı:</span>
              <span className="font-mono font-semibold text-zinc-200">
                {fiscalStatus.deviceSerial || 'Cihaz təyin edilməyib'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Şlüz Provayderi:</span>
              <span className="font-semibold text-indigo-400">
                {fiscalStatus.operatorName || 'Dövlət Vergi Xidməti E-Kassa Şlüzü'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Rejim:</span>
              <span className="font-mono text-zinc-200 uppercase">{fiscalStatus.mode}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Cari Status:</span>
              <Badge
                variant={
                  fiscalStatus.status === 'ACTIVE' && !isUnknown
                    ? 'success'
                    : fiscalStatus.status === 'UNAVAILABLE'
                    ? 'warning'
                    : 'danger'
                }
              >
                {getStatusLabel()}
              </Badge>
            </div>
          </div>

          {fiscalStatus.mode === 'REQUIRED' && (fiscalStatus.status !== 'ACTIVE' || isUnknown) && (
            <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-md text-rose-200 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong>MÜTLƏQ (REQUIRED) Fiskal Rejim:</strong> Kassa aparatı ilə əlaqə bərpa olunmayana qədər çek çapı və satış tamamlana bilməz.
              </div>
            </div>
          )}

          <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-md text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Təkrarlanan Fiskallaşdırma Qadağası
            </div>
            <p>
              AR Vergi Xidmətinin tələblərinə əsasən eyni çek iki dəfə vurula bilməz. Əlaqə kəsildikdə kor-təbii təkrar cəhd (blind retry) qadağandır; kassanın daxili yaddaş statusu yoxlanılmalı (reconciliation) və ya qəbzin çap olunub-olunmadığı dəqiqləşdirilməlidir.
            </p>
          </div>

          {reconcileResult && (
            <div className="p-2.5 bg-indigo-950/60 border border-indigo-800 rounded text-indigo-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{reconcileResult}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
            <Button
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                setReconcileResult(null);
              }}
            >
              Bağla
            </Button>
            <Button
              variant="default"
              onClick={handleReconcile}
              disabled={isReconciling}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isReconciling ? 'animate-spin' : ''}`} />
              {isReconciling ? 'Yoxlanılır...' : 'Statusu Yoxla (Reconcile)'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
