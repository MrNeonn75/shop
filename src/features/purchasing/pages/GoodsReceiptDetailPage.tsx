import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Truck,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/useToast';
import { purchasingRepository } from '../../../shared/adapters';
import { GoodsReceipt } from '../types';
import { DocumentWorkflowStepper } from '../components/DocumentWorkflowStepper';
import { formatMoney } from '../../../shared/utils/formatters';

export const GoodsReceiptDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [receipt, setReceipt] = useState<GoodsReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadReceipt = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await purchasingRepository.getGoodsReceiptById(id);
      if (!data) {
        toast({ title: 'Xəta', description: 'Mədaxil sənədi tapılmadı', variant: 'danger' });
        navigate('/purchasing/goods-receipts');
        return;
      }
      setReceipt(data);
    } catch {
      toast({ title: 'Xəta', description: 'Məlumatları yükləmək mümkün olmadı', variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReceipt();
  }, [id]);

  if (isLoading || !receipt) {
    return (
      <div className="p-8 text-center text-bh-gray-500">
        Mədaxil aktı yüklənir...
      </div>
    );
  }

  const hasDiscrepancy = receipt.items.some(
    (i) => i.receivedNowQty + i.previouslyReceivedQty !== i.orderedQty || i.damagedQty > 0 || i.rejectedQty > 0
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Malların Mədaxili', href: '/purchasing/goods-receipts' },
          { label: receipt.grNumber },
        ]}
      />

      <DocumentWorkflowStepper
        currentStage="receipt"
        currentDocNumber={receipt.grNumber}
        linkedDocs={receipt.linkedDocs}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white dark:bg-bh-black-800 border border-bh-gray-200 dark:border-bh-black-700 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/purchasing/goods-receipts')}
              className="p-1 h-7 w-7"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-bh-black-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-bh-black-700 dark:text-bh-gray-300" />
              Mədaxil Aktı #{receipt.grNumber}
            </h1>
            <Badge variant="success">Təsdiqlənib (Anbara Mədaxil Olundu)</Badge>
            {receipt.isDemo && (
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                DEMO
              </span>
            )}
          </div>
          <p className="text-xs text-bh-gray-500 mt-1 ml-9">
            PO: <strong className="text-black dark:text-white">{receipt.poNumber}</strong> |{' '}
            Təchizatçı: {receipt.supplierName} | Qəbul edən: {receipt.receivedByName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              navigate(
                `/purchasing/invoices?poId=${receipt.poId}&grId=${receipt.id}`
              )
            }
            className="gap-1.5"
          >
            <Receipt className="w-4 h-4" /> Fakturanı Qeydiyyata Al
          </Button>
        </div>
      </div>

      {/* Discrepancy Alert Banner if any */}
      {hasDiscrepancy && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-sm font-semibold block mb-0.5">
              Qəbul Kənarlaşması (Discrepancy Report)
            </strong>
            <p>
              Sifariş edilən və bu aktla faktiki qəbul edilən mallar arasında fərq və ya zədə qeydə alınmışdır.
              Faktura qəbulu zamanı 3-tərəfli uyğunlaşma yoxlamasında bu fərq nəzərə alınmalıdır.
            </p>
            {receipt.discrepancyNotes && (
              <p className="mt-1 font-medium italic">Qeyd: {receipt.discrepancyNotes}</p>
            )}
          </div>
        </div>
      )}

      {/* Stock Integration Note */}
      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-md flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>
            <strong>Anbar Hərəkət Jurnalı Yeniləndi:</strong> Bu akt əsasında #{receipt.stockDocumentId}{' '}
            nömrəli daxili mədaxil sənədi yaradılmış və anbar stoku artırılmışdır.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/inventory/documents')}
          className="h-7 text-[11px] border-emerald-400"
        >
          Anbar Sənədinə Keç
        </Button>
      </div>

      {/* Lines Table */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Təhvil Alınan Məhsullar</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bh-gray-50 dark:bg-bh-black-800 text-bh-gray-500 uppercase border-b">
              <tr>
                <th className="py-2.5 px-4">Məhsul</th>
                <th className="py-2.5 px-4">SKU / Barkod</th>
                <th className="py-2.5 px-4 text-center">Sifariş Sayı</th>
                <th className="py-2.5 px-4 text-center">Əvvəl Qəbul</th>
                <th className="py-2.5 px-4 text-center text-emerald-600 font-bold">Bu Aktla Qəbul</th>
                <th className="py-2.5 px-4 text-center text-rose-600">Zədəli</th>
                <th className="py-2.5 px-4 text-center text-amber-600">İmtina</th>
                <th className="py-2.5 px-4 text-right">Maya Qiyməti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bh-gray-200 dark:divide-bh-black-700">
              {receipt.items.map((it) => (
                <tr key={it.id} className="hover:bg-bh-gray-50/50">
                  <td className="py-3 px-4 font-medium text-bh-black-900 dark:text-white">
                    {it.productName} ({it.size} / {it.color})
                  </td>
                  <td className="py-3 px-4 font-mono">{it.sku}</td>
                  <td className="py-3 px-4 text-center font-mono">{it.orderedQty}</td>
                  <td className="py-3 px-4 text-center font-mono text-bh-gray-500">
                    {it.previouslyReceivedQty}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">
                    {it.receivedNowQty}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-rose-600">
                    {it.damagedQty || '-'}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-amber-600">
                    {it.rejectedQty || '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-medium">
                    {formatMoney(it.unitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
