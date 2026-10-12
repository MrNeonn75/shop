import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { reportsRepository } from '../../../shared/adapters';

interface AsyncReportProgressProps {
  jobId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export const AsyncReportProgress: React.FC<AsyncReportProgressProps> = ({
  jobId,
  onComplete,
  onCancel,
}) => {
  const [progress, setProgress] = useState(15);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const checkStatus = async () => {
      try {
        const res = await reportsRepository.checkAsyncReportStatus(jobId);
        setProgress(res.progressPercent);
        if (res.status === 'completed') {
          setStatus('completed');
          if (res.downloadUrl) setDownloadUrl(res.downloadUrl);
          if (interval) clearInterval(interval);
        } else if (res.status === 'failed') {
          setStatus('failed');
          if (interval) clearInterval(interval);
        }
      } catch {
        setStatus('failed');
        if (interval) clearInterval(interval);
      }
    };

    interval = setInterval(checkStatus, 800);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId]);

  return (
    <div className="bg-slate-900 text-white rounded-xl p-4 shadow-lg border border-slate-800 mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {status === 'processing' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
          {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {status === 'failed' && <AlertCircle className="w-5 h-5 text-rose-400" />}
          <div>
            <h4 className="text-sm font-semibold">
              {status === 'processing' && 'Böyük Həcmli Hesabat Fon Rejimində Hazırlanır...'}
              {status === 'completed' && 'Hesabat Uğurla Hazırlandı!'}
              {status === 'failed' && 'Hesabat generasiyasında xəta baş verdi'}
            </h4>
            <p className="text-xs text-slate-400">Tapşırıq ID: {jobId}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {status === 'completed' && downloadUrl && (
            <a
              href={downloadUrl}
              download="report_export.csv"
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              <span>Yüklə</span>
            </a>
          )}
          <button
            onClick={status === 'completed' ? onComplete : onCancel}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded"
          >
            {status === 'completed' ? 'Bağla' : 'Ləğv et'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>İcra: {progress}%</span>
        <span>{status === 'processing' ? 'Təxmini qalan vaxt: ~2 saniyə' : 'Tamamlandı'}</span>
      </div>
    </div>
  );
};

