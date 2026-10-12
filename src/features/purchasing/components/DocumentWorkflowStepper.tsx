import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  PackagePlus,
  Truck,
  Receipt,
  CreditCard,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { PurchasingWorkflowStage, WorkflowLinkedDocuments } from '../types';
import { cn } from '../../../shared/utils/cn';

interface DocumentWorkflowStepperProps {
  currentStage: PurchasingWorkflowStage;
  linkedDocs?: WorkflowLinkedDocuments;
  currentDocNumber?: string;
  className?: string;
}

interface StepDef {
  key: PurchasingWorkflowStage;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  docNumber?: string;
  docLink?: string;
}

export const DocumentWorkflowStepper: React.FC<DocumentWorkflowStepperProps> = ({
  currentStage,
  linkedDocs = {},
  currentDocNumber,
  className,
}) => {
  const navigate = useNavigate();

  const stagesOrder: PurchasingWorkflowStage[] = [
    'request',
    'approval',
    'order',
    'receipt',
    'invoice',
    'payment',
  ];

  const currentIdx = stagesOrder.indexOf(currentStage);

  const steps: StepDef[] = [
    {
      key: 'request',
      label: '1. Tələbnamə',
      sublabel: 'Şöbə sorğusu',
      icon: <FileText className="w-4 h-4" />,
      docNumber:
        currentStage === 'request'
          ? currentDocNumber
          : linkedDocs.requestNumber,
      docLink: linkedDocs.requestId
        ? `/purchasing/requests`
        : undefined,
    },
    {
      key: 'approval',
      label: '2. Təsdiq',
      sublabel: 'Rəhbərlik baxışı',
      icon: <CheckCircle2 className="w-4 h-4" />,
      docNumber: currentStage === 'approval' ? 'Nəzərdən keçirilir' : 'Təsdiqlənib',
    },
    {
      key: 'order',
      label: '3. Sifariş (PO)',
      sublabel: 'Təchizat sifarişi',
      icon: <PackagePlus className="w-4 h-4" />,
      docNumber:
        currentStage === 'order'
          ? currentDocNumber
          : linkedDocs.orderNumber,
      docLink: linkedDocs.orderId
        ? `/purchasing/orders/${linkedDocs.orderId}`
        : undefined,
    },
    {
      key: 'receipt',
      label: '4. Mədaxil (GR)',
      sublabel: 'Anbar qəbulu',
      icon: <Truck className="w-4 h-4" />,
      docNumber:
        currentStage === 'receipt'
          ? currentDocNumber
          : linkedDocs.receiptNumber,
      docLink: linkedDocs.receiptId
        ? `/purchasing/goods-receipts/${linkedDocs.receiptId}`
        : undefined,
    },
    {
      key: 'invoice',
      label: '5. Faktura (INV)',
      sublabel: 'Üçtərəfli uyğunlaşma',
      icon: <Receipt className="w-4 h-4" />,
      docNumber:
        currentStage === 'invoice'
          ? currentDocNumber
          : linkedDocs.invoiceNumber,
      docLink: linkedDocs.invoiceId
        ? `/purchasing/invoices`
        : undefined,
    },
    {
      key: 'payment',
      label: '6. Ödəniş',
      sublabel: 'Kassa / Bank çıxarışı',
      icon: <CreditCard className="w-4 h-4" />,
      docNumber:
        currentStage === 'payment'
          ? currentDocNumber
          : linkedDocs.paymentNumber,
      docLink: linkedDocs.paymentId
        ? `/purchasing/payments`
        : undefined,
    },
  ];

  return (
    <div
      className={cn(
        'w-full bg-white dark:bg-bh-black-800 border border-bh-gray-200 dark:border-bh-black-700 rounded-lg p-4 shadow-sm mb-6',
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-bh-gray-500 dark:text-bh-gray-400">
          Sənəd Zənciri və İş Axını (Procurement Workflow)
        </span>
        <span className="text-xs text-bh-gray-400">
          Mərhələ {currentIdx + 1} / {stagesOrder.length}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 relative">
        {steps.map((step, idx) => {
          const isPassed = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isUpcoming = idx > currentIdx;

          return (
            <div
              key={step.key}
              className={cn(
                'relative flex flex-col p-2.5 rounded-md border transition-all text-left',
                isCurrent &&
                  'border-black dark:border-white bg-bh-gray-50 dark:bg-bh-black-900 shadow-sm ring-1 ring-black dark:ring-white',
                isPassed &&
                  'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-bh-black-900 dark:text-white',
                isUpcoming &&
                  'border-bh-gray-200 dark:border-bh-black-700 bg-white dark:bg-bh-black-800 opacity-60'
              )}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span
                  className={cn(
                    'p-1 rounded text-xs',
                    isCurrent && 'bg-black text-white dark:bg-white dark:text-black',
                    isPassed && 'bg-emerald-600 text-white',
                    isUpcoming && 'bg-bh-gray-100 text-bh-gray-600 dark:bg-bh-black-700 dark:text-bh-gray-300'
                  )}
                >
                  {step.icon}
                </span>

                {idx < steps.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-bh-gray-400 hidden lg:block absolute -right-2 top-4 z-10" />
                )}

                {step.docLink && (
                  <button
                    type="button"
                    onClick={() => navigate(step.docLink!)}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-0.5 ml-auto"
                    title="Sənədə keç"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              <span className="text-xs font-semibold truncate text-bh-black-900 dark:text-white">
                {step.label}
              </span>
              <span className="text-[11px] text-bh-gray-500 dark:text-bh-gray-400 truncate">
                {step.sublabel}
              </span>

              {step.docNumber && (
                <span className="mt-1 font-mono text-[11px] text-bh-black-800 dark:text-bh-gray-200 font-medium truncate">
                  {step.docNumber}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

