import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { Button } from '../../../components/ui/Button';
import { VariantMatrixData } from '../services/ledgerEngine';
import { useNavigate } from 'react-router-dom';
import { History, Tag, Box } from 'lucide-react';

interface VariantMatrixDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: VariantMatrixData | null;
}

export const VariantMatrixDrawer: React.FC<VariantMatrixDrawerProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const navigate = useNavigate();

  if (!data) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${data.productName} — Ölçü × Rəng Matrisi`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Header Summary Cards */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-muted/40 rounded-xl border border-border">
          <div>
            <div className="text-xs text-muted-foreground">Məkan / Anbar</div>
            <div className="text-sm font-semibold flex items-center gap-1.5 mt-0.5">
              <Box className="h-4 w-4 text-primary" />
              {data.warehouseName}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <span className="text-muted-foreground block text-[11px]">Faktiki Qalıq</span>
              <span className="font-bold text-sm text-foreground">{data.totalOnHand}</span>
            </div>
            <div className="text-center">
              <span className="text-muted-foreground block text-[11px]">Sərbəst Qalıq</span>
              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                {data.totalAvailable}
              </span>
            </div>
            <div className="text-center">
              <span className="text-muted-foreground block text-[11px]">Rezerv Edilmiş</span>
              <span className="font-bold text-sm text-amber-600 dark:text-amber-400">
                {data.totalReserved}
              </span>
            </div>
          </div>
        </div>

        {/* Matrix Grid: Size (rows) × Color (columns) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ölçü və Rəng Üzrə Qalıq Matrisi
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Formul: Faktiki = Sərbəst + Rezerv
            </span>
          </div>

          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/70 border-b border-border">
                  <th className="py-2.5 px-3 font-semibold text-muted-foreground border-r border-border">
                    Ölçü \ Rəng
                  </th>
                  {data.colors.map((color) => (
                    <th key={color} className="py-2.5 px-3 font-semibold text-center text-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {color}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sizes.map((size) => (
                  <tr key={size} className="border-b border-border hover:bg-muted/20">
                    <td className="py-2.5 px-3 font-bold bg-muted/40 border-r border-border">
                      {size}
                    </td>
                    {data.colors.map((color) => {
                      const cell = data.matrix[size]?.[color];
                      if (!cell) {
                        return (
                          <td key={color} className="py-2.5 px-3 text-center text-muted-foreground/40 bg-muted/5">
                            —
                          </td>
                        );
                      }

                      return (
                        <td key={color} className="py-2.5 px-3 text-center">
                          <div className="inline-flex flex-col items-center gap-1">
                            <span
                              className={`text-sm font-bold ${
                                cell.onHand === 0
                                  ? 'text-muted-foreground/60'
                                  : cell.onHand < 0
                                  ? 'text-rose-600'
                                  : 'text-foreground'
                              }`}
                            >
                              {cell.onHand} ədəd
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-emerald-600 font-medium" title="Sərbəst">
                                {cell.available} sərbəst
                              </span>
                              {cell.reserved > 0 && (
                                <span className="text-amber-600 font-medium" title="Rezerv">
                                  ({cell.reserved} rez.)
                                </span>
                              )}
                              {cell.inTransit > 0 && (
                                <span className="text-blue-600 font-medium" title="Yolda">
                                  +{cell.inTransit} yol.
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {cell.sku}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action button to jump to ledger with filter */}
        <div className="pt-2 flex justify-between items-center border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              navigate(`/inventory/ledger?productId=${data.productId}&warehouseId=${data.warehouseId}`);
            }}
          >
            <History className="mr-2 h-4 w-4" />
            Bu Məhsulun Bütün Hərəkətlərinə Bax
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Bağla
          </Button>
        </div>
      </div>
    </Drawer>
  );
};
