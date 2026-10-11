import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Breadcrumbs } from '../../../components/ui/Breadcrumbs';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { InventoryNavHeader } from '../components/InventoryNavHeader';
import { inventoryRepository } from '../../../shared/adapters';
import { StockAlertRule, StockBalance } from '../types';
import { SEEDED_CATEGORIES } from '../../catalog/data/taxonomyData';
import { AdminWarehouse } from '../../../shared/adapters/mock/adminMockData';
import { useToast } from '../../../components/ui/useToast';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  AlertTriangle,
  RotateCcw,
  Trash2,
} from 'lucide-react';

export const StockAlertsPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rules, setRules] = useState<StockAlertRule[]>([]);
  const [warehouses, setWarehouses] = useState<AdminWarehouse[]>([]);
  const [lowStockBalances, setLowStockBalances] = useState<StockBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Rule Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ruleScope, setRuleScope] = useState<StockAlertRule['scope']>('global');
  const [targetId, setTargetId] = useState('');
  const [minQty, setMinQty] = useState(5);
  const [autoReorderQty, setAutoReorderQty] = useState(15);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rList, whList, balList] = await Promise.all([
        inventoryRepository.getAlertRules(),
        inventoryRepository.getWarehouses(),
        inventoryRepository.getStockBalances({ tab: 'low' }),
      ]);
      setRules(rList);
      setWarehouses(whList);
      setLowStockBalances(balList);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveRule = async () => {
    let resolvedName = '';
    if (ruleScope === 'global') {
      resolvedName = 'Bütün məhsullar üzrə susmaya görə';
    } else if (ruleScope === 'warehouse') {
      const wh = warehouses.find((w) => w.id === targetId);
      resolvedName = wh ? wh.name : 'Seçilmiş anbar';
    } else if (ruleScope === 'category') {
      const cat = SEEDED_CATEGORIES.find((c) => c.id === targetId);
      resolvedName = cat ? cat.name : 'Seçilmiş kateqoriya';
    }

    try {
      await inventoryRepository.saveAlertRule({
        scope: ruleScope,
        targetId: ruleScope !== 'global' ? targetId : undefined,
        targetName: resolvedName,
        minQty,
        autoReorderQty,
        isActive: true,
      });

      toast({
        type: 'success',
        title: 'Qayda Saxlanıldı',
        message: 'Minimum stok limiti qaydası uğurla əlavə edildi.',
      });

      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await inventoryRepository.deleteAlertRule(id);
      toast({
        type: 'info',
        title: 'Qayda Silindi',
        message: 'Limit qaydası ləğv edildi.',
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Məhsul və Anbar', href: '/inventory' },
          { label: 'Stok Limitləri və Siqnallar' },
        ]}
      />

      <PageHeader
        title="Minimum Stok Limitləri və Siqnal Qaydaları"
        description="Məhsul, kateqoriya və anbarlar üzrə kritik stok səviyyələri və avtomatik bildiriş qaydalarının idarə edilməsi."
        actions={
          <Button variant="default" size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Qayda Əlavə Et
          </Button>
        }
      />

      <InventoryNavHeader />

      {/* SECTION 1: ACTIVELY TRIGGERED ALERTS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Hazırda Kritik Həddə Olan Mallar ({lowStockBalances.length})
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Qalıq ≤ Minimum Kritik Hədd
          </span>
        </div>

        <Card className="overflow-hidden border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                  <th className="py-2.5 px-3">Məhsul & SKU</th>
                  <th className="py-2.5 px-3">Anbar</th>
                  <th className="py-2.5 px-2 text-center">Faktiki Qalıq</th>
                  <th className="py-2.5 px-2 text-center">Təyin Olunmuş Limit</th>
                  <th className="py-2.5 px-2 text-center">Sərbəst Qalıq</th>
                  <th className="py-2.5 px-3 text-right">Tövsiyə Olunan Tədbir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Kritik stok məlumatları yüklənir...
                    </td>
                  </tr>
                ) : lowStockBalances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Kritik stok həddinə çatmış məhsul yoxdur.
                    </td>
                  </tr>
                ) : (
                  lowStockBalances.map((b) => (
                    <tr key={`${b.variantId}_${b.warehouseId}`} className="hover:bg-muted/20">
                      <td className="py-2 px-3">
                        <div className="font-semibold text-foreground">{b.productName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {b.variantSku} • {b.size} / {b.color}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-medium">{b.warehouseName}</td>
                      <td className="py-2 px-2 text-center font-bold text-amber-600">
                        {b.onHand} ədəd
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-foreground">
                        {b.minLevel} ədəd
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-rose-600">
                        {b.available} ədəd
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => navigate('/transfers/new')}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Transfer Tələbi Aç
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* SECTION 2: CONFIGURED RULES LIST */}
      <div className="pt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Konfiqurasiya Edilmiş Qaydalar ({rules.length})
        </h3>

        <Card className="overflow-hidden border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/70 text-muted-foreground border-b border-border font-semibold">
                  <th className="py-2.5 px-3">Qayda Əhatəsi (Scope)</th>
                  <th className="py-2.5 px-3">Hədəf Obyekt</th>
                  <th className="py-2.5 px-2 text-center">Minimum Qalıq Limiti</th>
                  <th className="py-2.5 px-2 text-center">Avto-Sifariş Həcmi</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-muted/20">
                    <td className="py-2.5 px-3 capitalize font-medium">
                      {rule.scope === 'global' ? 'Ümumi (Bütün)' : rule.scope === 'category' ? 'Kateqoriya' : 'Anbar'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-foreground">{rule.targetName}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-amber-600">
                      {rule.minQty} ədəd
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-foreground">
                      {rule.autoReorderQty || 10} ədəd
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant="success" size="sm">Aktiv</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {rule.scope !== 'global' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* CREATE NEW RULE MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Minimum Stok Limiti Qaydası"
        size="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-muted-foreground font-medium mb-1">Qayda Növü (Scope)</label>
            <select
              value={ruleScope}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRuleScope(e.target.value as StockAlertRule['scope'])}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="category">Kateqoriya Üzrə Xüsusi Hədd</option>
              <option value="warehouse">Anbar Üzrə Xüsusi Hədd</option>
            </select>
          </div>

          {ruleScope === 'warehouse' && (
            <div>
              <label className="block text-muted-foreground font-medium mb-1">Hədəf Anbar</label>
              <select
                value={targetId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Anbar seçin...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {ruleScope === 'category' && (
            <div>
              <label className="block text-muted-foreground font-medium mb-1">Hədəf Kateqoriya</label>
              <select
                value={targetId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Kateqoriya seçin...</option>
                {SEEDED_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Kritik Minimum Qalıq (ədəd)
              </label>
              <Input
                type="number"
                min="1"
                value={minQty}
                onChange={(e) => setMinQty(parseInt(e.target.value) || 1)}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="block text-muted-foreground font-medium mb-1">
                Avto-Sifariş Tövsiyəsi (ədəd)
              </label>
              <Input
                type="number"
                min="1"
                value={autoReorderQty}
                onChange={(e) => setAutoReorderQty(parseInt(e.target.value) || 1)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Ləğv Et
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveRule}>
              Qaydanı Yadda Saxla
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
