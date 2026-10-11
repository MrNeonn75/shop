import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { InventoryNavHeader } from '../components/InventoryNavHeader';
import { inventoryRepository } from '../../../shared/adapters';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { WarehouseBinZone, StockBalance } from '../types';
import { useNavigate } from 'react-router-dom';
import {
  Warehouse,
  Layers,
  MapPin,
  ExternalLink,
} from 'lucide-react';

export const WarehousesPage: React.FC = () => {
  const navigate = useNavigate();

  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [selectedWh, setSelectedWh] = useState<AdminWarehouse | null>(null);
  const [bins, setBins] = useState<WarehouseBinZone[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [whList, balList] = await Promise.all([
        inventoryRepository.getWarehouses(),
        inventoryRepository.getStockBalances(),
      ]);
      setWarehouses(whList);
      setBalances(balList);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenWarehouseDetail = async (wh: AdminWarehouse) => {
    setSelectedWh(wh);
    setIsDetailModalOpen(true);
    try {
      const binList = await inventoryRepository.getWarehouseBins(wh.id);
      setBins(binList);
    } catch (err) {
      console.error(err);
    }
  };

  const getWarehouseStats = (warehouseId: string) => {
    const whBalances = balances.filter((b) => b.warehouseId === warehouseId);
    const skuCount = new Set(whBalances.map((b) => b.variantSku)).size;
    const totalUnits = whBalances.reduce((sum, b) => sum + b.onHand, 0);
    const totalValuation = whBalances.reduce((sum, b) => sum + b.valuationQapik, 0);
    const lowStockCount = whBalances.filter((b) => b.stockState === 'low').length;

    return { skuCount, totalUnits, totalValuation, lowStockCount };
  };

  const getTypeBadge = (type: AdminWarehouse['type']) => {
    switch (type) {
      case 'central':
        return <Badge variant="default" size="sm">Mərkəzi Loqistika</Badge>;
      case 'branch':
        return <Badge variant="neutral" size="sm">Filial Anbarı</Badge>;
      case 'in-transit':
        return <Badge variant="warning" size="sm">Filiallararası Tranzit</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'Anbarlar və Zonalar' },
        ]}
      />

      <PageHeader
        title="Anbarlar və Yerləşmə Zonaları"
        description="Mərkəzi, filial və tranzit anbarlarının strukturu, tutumu, rəf/zona bölgüsü və cari stok xülasəsi."
      />

      <InventoryNavHeader />

      {/* Warehouse Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
            Anbar məlumatları yüklənir...
          </div>
        ) : (
          warehouses.map((wh) => {
            const stats = getWarehouseStats(wh.id);

          return (
            <Card key={wh.id} className="p-4 bg-card border-border flex flex-col justify-between hover:border-primary/50 transition-colors">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <Warehouse className="h-4 w-4 text-primary" />
                      {wh.name}
                    </h3>
                    <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                      Kod: {wh.code}
                    </div>
                  </div>
                  {getTypeBadge(wh.type)}
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{wh.branchName}</span>
                </div>

                {/* Stock Stats Strip */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-muted/40 rounded-xl border border-border text-center text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Çeşid (SKU)</span>
                    <span className="font-bold text-foreground">{stats.skuCount}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Faktiki Stok</span>
                    <span className="font-bold text-foreground">{stats.totalUnits} ədəd</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Kritik Az</span>
                    <span className={`font-bold ${stats.lowStockCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {stats.lowStockCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 mt-3 border-t border-border flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleOpenWarehouseDetail(wh)}
                >
                  <Layers className="h-3.5 w-3.5 mr-1" />
                  Rəf və Zonalar
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => navigate(`/inventory?warehouseId=${wh.id}`)}
                >
                  Qalıqlara Bax
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </Card>
          );
        }))}
      </div>

      {/* WAREHOUSE DETAIL & BINS MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedWh ? `${selectedWh.name} — Zonalar və Rəflər` : 'Anbar Detalı'}
        size="lg"
      >
        {selectedWh && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-xl border border-border">
              <div>
                <span className="text-muted-foreground block text-[10px]">Anbar Kodu</span>
                <span className="font-mono font-semibold">{selectedWh.code}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Sahə Tutumu</span>
                <span className="font-semibold">{selectedWh.capacitySqM} m²</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Bağlı Filial</span>
                <span className="font-semibold">{selectedWh.branchName}</span>
              </div>
            </div>

            {/* Bins / Zones List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">
                  Məkan və Rəf Zonaları (Bins & Zones)
                </h4>
                <Badge variant="neutral" size="sm">
                  {bins.length} Zolaq/Göz
                </Badge>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Kod</th>
                      <th className="py-2.5 px-3">Zolaq (Zone)</th>
                      <th className="py-2.5 px-3">Rəf (Rack)</th>
                      <th className="py-2.5 px-3">Göz (Bin)</th>
                      <th className="py-2.5 px-3">Təyinat / Təsvir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bins.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          Bu anbar üçün rəf/zona bölgüsü qeyd edilməyib.
                        </td>
                      </tr>
                    ) : (
                      bins.map((bin) => (
                        <tr key={bin.id} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-mono font-bold text-primary">
                            {bin.code}
                          </td>
                          <td className="py-2 px-3 font-medium">{bin.zone}</td>
                          <td className="py-2 px-3">{bin.rack}</td>
                          <td className="py-2 px-3">{bin.bin}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {bin.description || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setIsDetailModalOpen(false)}>
                Bağla
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
