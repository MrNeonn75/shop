import React from 'react';
import { TransferStatus, TransferTimelineEvent } from '../types';
import { formatDateTime } from '../../../shared/utils/formatters';
import { Check, XCircle, Truck } from 'lucide-react';

interface TransferStepperProps {
  status: TransferStatus;
  timeline: TransferTimelineEvent[];
}

interface StepDef {
  status: TransferStatus;
  label: string;
}

const STANDARD_STEPS: StepDef[] = [
  { status: 'draft', label: 'Qaralama' },
  { status: 'submitted', label: 'Təsdiq Gözləyir' },
  { status: 'approved', label: 'Təsdiqləndi' },
  { status: 'picking', label: 'Yığımda' },
  { status: 'dispatched', label: 'Yola Salındı (Tranzitdə)' },
  { status: 'received', label: 'Qəbul Edildi' },
];

export const TransferStepper: React.FC<TransferStepperProps> = ({ status, timeline }) => {
  // If rejected or cancelled, show special banner
  const isRejected = status === 'rejected';
  const isCancelled = status === 'cancelled';
  const isPartiallyReceived = status === 'partially_received';

  const getStepEvent = (stepStatus: TransferStatus) => {
    return timeline.find((e) => e.status === stepStatus);
  };

  const getStepIndex = (st: TransferStatus) => {
    switch (st) {
      case 'draft': return 0;
      case 'submitted': return 1;
      case 'approved': return 2;
      case 'picking': return 3;
      case 'dispatched':
      case 'in_transit': return 4;
      case 'partially_received':
      case 'received': return 5;
      default: return -1;
    }
  };

  const currentIdx = getStepIndex(status);

  if (isRejected || isCancelled) {
    const lastEvent = timeline[timeline.length - 1];
    return (
      <div className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
        isRejected
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
          : 'bg-muted border-border text-muted-foreground'
      }`}>
        <div className="flex items-center gap-3">
          <XCircle className="h-6 w-6 shrink-0" />
          <div>
            <div className="font-bold text-sm">
              Transfer {isRejected ? 'İmtina Edildi' : 'Ləğv Edildi'}
            </div>
            <div className="text-[11px] mt-0.5">
              İcraçı: {lastEvent?.userName || 'Menecer'} • Tarix: {lastEvent ? formatDateTime(lastEvent.timestamp) : '—'}
            </div>
            {lastEvent?.comment && (
              <div className="mt-1 font-medium text-foreground bg-background/50 p-1.5 rounded">
                Səbəb: {lastEvent.comment}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-border bg-card">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 relative">
        {STANDARD_STEPS.map((step, idx) => {
          const isCompleted = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          const event = getStepEvent(step.status);

          let stepTitle = step.label;
          if (step.status === 'received' && isPartiallyReceived) {
            stepTitle = 'Qismən Qəbul';
          }

          return (
            <div key={step.status} className="flex-1 flex flex-col md:items-center text-left md:text-center relative w-full">
              {/* Step indicator circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                  isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : step.status === 'dispatched' && isCurrent ? (
                  <Truck className="h-4 w-4 animate-pulse" />
                ) : (
                  idx + 1
                )}
              </div>

              {/* Title & Metadata */}
              <div className="mt-1.5 space-y-0.5">
                <div className={`text-xs font-semibold ${isCurrent ? 'text-primary font-bold' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {stepTitle}
                </div>
                {event && (
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    <div>{event.userName}</div>
                    <div className="font-mono">{formatDateTime(event.timestamp)}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
