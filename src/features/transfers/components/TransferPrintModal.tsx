import React, { useRef } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Transfer } from '../types';
import { formatMoney, formatDateTime } from '../../../shared/utils/formatters';
import { Printer } from 'lucide-react';
import { BrandLogo } from '../../../components/ui/BrandLogo';

interface TransferPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: Transfer | null;
}

export const TransferPrintModal: React.FC<TransferPrintModalProps> = ({
  isOpen,
  onClose,
  transfer,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!transfer) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalQty = transfer.items.reduce((sum, i) => sum + (i.dispatchedQty || i.requestedQty), 0);
  const totalVal = transfer.items.reduce(
    (sum, i) => sum + (i.dispatchedQty || i.requestedQty) * i.unitCostQapik,
    0
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Transfer Qaiməsi #${transfer.transferNumber}`}
      size="xl"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" size="sm" onClick={onClose}>
            Bağla
          </Button>
          <Button variant="default" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Çap Et (Waybill PDF)
          </Button>
        </div>
      }
    >
      <div ref={printRef} className="p-4 bg-white text-black text-xs space-y-4 rounded-lg font-sans">
        {/* Printable Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div className="space-y-1">
            <BrandLogo size="sm" showWordmark={true} />
            <div className="text-[10px] text-neutral-600">
              BRAND HOUSE MMC • Pərakəndə Şəbəkəsi
            </div>
            <div className="text-[10px] text-neutral-600">
              VÖEN: 1405829141 • Bakı, Azərbaycan
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tracking-tight">
              DAXİLİ TRANSFER QAİMƏSİ
            </div>
            <div className="text-xs font-mono font-bold mt-1">
              № {transfer.transferNumber}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Tarix: {formatDateTime(transfer.createdAt)}
            </div>
          </div>
        </div>

        {/* Sender / Receiver Box */}
        <div className="grid grid-cols-2 gap-4 p-3 bg-neutral-50 rounded border text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">
              Göndərən Mənbə (Source):
            </span>
            <div className="font-bold text-sm text-neutral-900 mt-0.5">
              {transfer.sourceWarehouseName}
            </div>
            <div className="text-[11px] text-neutral-600">
              Filial: {transfer.sourceBranchName}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">
              Qəbul Edən Təyinat (Destination):
            </span>
            <div className="font-bold text-sm text-neutral-900 mt-0.5">
              {transfer.destinationWarehouseName}
            </div>
            <div className="text-[11px] text-neutral-600">
              Filial: {transfer.destinationBranchName}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-neutral-100 font-semibold border-b text-neutral-700">
              <tr>
                <th className="py-2 px-2 text-center w-8">№</th>
                <th className="py-2 px-3">Məhsulun Adı</th>
                <th className="py-2 px-3">SKU / Barkod</th>
                <th className="py-2 px-2 text-center">Ölçü / Rəng</th>
                <th className="py-2 px-2 text-center">Miqdar</th>
                <th className="py-2 px-3 text-right">Vahid Qiymət</th>
                <th className="py-2 px-3 text-right">Cəmi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {transfer.items.map((item, idx) => {
                const qty = item.dispatchedQty || item.requestedQty;
                const lineTotal = qty * item.unitCostQapik;

                return (
                  <tr key={item.id}>
                    <td className="py-2 px-2 text-center font-mono text-[10px]">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold">{item.productName}</td>
                    <td className="py-2 px-3 font-mono text-[10px]">
                      {item.variantSku} / {item.variantBarcode}
                    </td>
                    <td className="py-2 px-2 text-center">{item.size} / {item.color}</td>
                    <td className="py-2 px-2 text-center font-bold">{qty} ədəd</td>
                    <td className="py-2 px-3 text-right">{formatMoney(item.unitCostQapik)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatMoney(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-100 font-bold border-t">
              <tr>
                <td colSpan={4} className="py-2 px-3 text-right uppercase">Cəmi:</td>
                <td className="py-2 px-2 text-center">{totalQty} ədəd</td>
                <td></td>
                <td className="py-2 px-3 text-right">{formatMoney(totalVal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {transfer.notes && (
          <div className="text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded border">
            <span className="font-semibold">Qeyd:</span> {transfer.notes}
          </div>
        )}

        {/* Signatures Footer */}
        <div className="grid grid-cols-3 gap-4 pt-6 border-t mt-4 text-[10px]">
          <div>
            <div className="text-neutral-500 font-semibold mb-6">Təhvil verdi (Mənbə Anbardar):</div>
            <div className="border-t border-neutral-400 pt-1">İmza: _______________________</div>
          </div>
          <div>
            <div className="text-neutral-500 font-semibold mb-6">Daşıyıcı / Sürücü:</div>
            <div className="border-t border-neutral-400 pt-1">İmza: _______________________</div>
          </div>
          <div>
            <div className="text-neutral-500 font-semibold mb-6">Təhvil aldı (Təyinat Anbardar):</div>
            <div className="border-t border-neutral-400 pt-1">İmza: _______________________</div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
