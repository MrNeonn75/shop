import React, { useState, useMemo } from 'react';
import {
  PromotionRule,
  CartSimulationItem,
  CartSimulationInput,
} from '../types';
import { simulatePromotionEngine } from '../utils/promotionEngine';
import { usePermission } from '../../../shared/hooks/usePermission';
import { formatMoney, toQapik } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  Calculator,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Info,
  Tag,
} from 'lucide-react';

interface PromotionSimulatorPanelProps {
  rules: PromotionRule[];
}

const SAMPLE_CATALOG: CartSimulationItem[] = [
  {
    id: 'item-sim-1',
    productId: 'prod-md-suit',
    productName: 'Massimo Dutti İtalyan Yundan Kostyum',
    brandId: 'brand-1',
    brandName: 'Massimo Dutti',
    categoryId: 'cat-clothing',
    categoryName: 'Geyim',
    quantity: 1,
    unitPriceQapik: toQapik(35000), // 350.00 ₼
    costPriceQapik: toQapik(19000), // 190.00 ₼
  },
  {
    id: 'item-sim-2',
    productId: 'prod-zara-shirt',
    productName: 'Zara Slim Fit Ağ Köynək',
    brandId: 'brand-2',
    brandName: 'Zara',
    categoryId: 'cat-clothing',
    categoryName: 'Geyim',
    quantity: 2,
    unitPriceQapik: toQapik(7500), // 75.00 ₼
    costPriceQapik: toQapik(3800), // 38.00 ₼
  },
  {
    id: 'item-sim-3',
    productId: 'prod-oxford-shoes',
    productName: 'Dəri Oksford Klassik Ayaqqabı',
    brandId: 'brand-1',
    brandName: 'Massimo Dutti',
    categoryId: 'cat-shoes',
    categoryName: 'Ayaqqabı',
    quantity: 1,
    unitPriceQapik: toQapik(18000), // 180.00 ₼
    costPriceQapik: toQapik(10500), // 105.00 ₼
  },
  {
    id: 'item-sim-4',
    productId: 'prod-leather-belt',
    productName: 'Təbii Dəri Kəmər',
    brandId: 'brand-1',
    brandName: 'Massimo Dutti',
    categoryId: 'cat-accessories',
    categoryName: 'Aksessuarlar',
    quantity: 1,
    unitPriceQapik: toQapik(4500), // 45.00 ₼
    costPriceQapik: toQapik(2200), // 22.00 ₼
  },
];

export const PromotionSimulatorPanel: React.FC<PromotionSimulatorPanelProps> = ({ rules }) => {
  const { can } = usePermission();
  const canViewCost = can('products.cost_price.view');

  const [cartItems, setCartItems] = useState<CartSimulationItem[]>([
    { ...SAMPLE_CATALOG[0] },
    { ...SAMPLE_CATALOG[1] },
  ]);
  const [selectedBranch, setSelectedBranch] = useState<string>('branch-1');
  const [customerTier, setCustomerTier] = useState<string>('gold');
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');

  // Run pure engine simulation
  const simulationResult = useMemo(() => {
    const input: CartSimulationInput = {
      branchId: selectedBranch,
      customerTier,
      promoCode: promoCodeInput,
      items: cartItems,
    };

    return simulatePromotionEngine(input, rules, {
      canViewCost,
    });
  }, [cartItems, selectedBranch, customerTier, promoCodeInput, rules, canViewCost]);

  const handleAddItem = (sample: CartSimulationItem) => {
    const existing = cartItems.find((it) => it.productId === sample.productId);
    if (existing) {
      setCartItems((prev) =>
        prev.map((it) =>
          it.productId === sample.productId ? { ...it, quantity: it.quantity + 1 } : it
        )
      );
    } else {
      setCartItems((prev) => [...prev, { ...sample, id: `sim-${Date.now()}` }]);
    }
  };

  const handleUpdateQty = (itemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((it) => (it.id === itemId ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it))
        .filter((it) => it.quantity > 0)
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Aksiya və Endirim Simulyatoru (Mərkəzi Qayda Mühərriki)
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Test səbətini yığın; server qayda mühərriki prioritetə, steking və eksklüzivlik şərtlərinə əsasən yekun qiyməti hesablayır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-background text-xs">
            {rules.filter((r) => r.isActive).length} Aktiv Qayda
          </Badge>
          {canViewCost && (
            <Badge variant="info" className="text-xs">
              Maya Dəyəri Monitorinqi Aktivdir
            </Badge>
          )}
        </div>
      </div>

      {/* Simulator Inputs & Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Səbətə Nümunə Məhsul Əlavə Et:</span>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_CATALOG.map((sample) => (
                <Button
                  key={sample.productId}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddItem(sample)}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {sample.productName.split(' ')[0]} ({formatMoney(sample.unitPriceQapik)})
                </Button>
              ))}
            </div>
          </div>

          {/* Cart Table */}
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Məhsul</th>
                  <th className="px-3 py-3">Say</th>
                  <th className="px-3 py-3 text-right">İlkin Qiymət</th>
                  <th className="px-3 py-3 text-right">Endirim</th>
                  <th className="px-3 py-3 text-right">Yekun Qiymət</th>
                  {canViewCost && <th className="px-3 py-3 text-right">Maya Dəyəri</th>}
                  <th className="px-3 py-3 text-center">Sil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {simulationResult.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canViewCost ? 7 : 6}
                      className="px-4 py-8 text-center text-muted-foreground text-sm"
                    >
                      Səbət boşdur. Yuxarıdakı düymələrlə məhsul əlavə edin.
                    </td>
                  </tr>
                ) : (
                  simulationResult.items.map((it) => (
                    <tr
                      key={it.itemId}
                      className={`hover:bg-muted/20 ${it.isBelowCost ? 'bg-destructive/5' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div>{it.productName}</div>
                        {it.isBelowCost && canViewCost && (
                          <span className="inline-flex items-center text-xs text-destructive font-normal mt-0.5">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Maya dəyərindən {formatMoney(it.costDeficitQapik)} aşağıdır!
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(it.itemId, -1)}
                            className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted text-xs font-semibold"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-medium">{it.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(it.itemId, 1)}
                            className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted text-xs font-semibold"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {formatMoney(it.originalTotalQapik)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-success">
                        {it.discountQapik > 0 ? `-${formatMoney(it.discountQapik)}` : '0.00 ₼'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                        {formatMoney(it.finalTotalQapik)}
                      </td>
                      {canViewCost && (
                        <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                          {formatMoney(it.costPriceQapik ? it.costPriceQapik * it.quantity : 0)}
                        </td>
                      )}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.itemId)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Margin Warning Alert if selling price < cost */}
          {canViewCost && simulationResult.marginWarnings.length > 0 && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">
                  Diqqət: Maya Dəyərindən Aşağı Satış Xəbərdarlığı!
                </h4>
                <p className="text-xs mt-1 text-destructive/90">
                  Tətbiq edilən aksiyalar nəticəsində bəzi məhsulların effektiv vahid qiyməti alış / maya dəyərindən aşağı düşmüşdür:
                </p>
                <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                  {simulationResult.marginWarnings.map((w, idx) => (
                    <li key={idx}>
                      <span className="font-semibold">{w.productName}</span>: Maya dəyəri{' '}
                      {formatMoney(w.costPriceQapik)}, Satış qiyməti{' '}
                      {formatMoney(w.effectiveUnitPriceQapik)} (Vahid üzrə zərər:{' '}
                      <span className="font-bold">{formatMoney(w.deficitQapik)}</span>)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Rule Conflict Warnings */}
          {simulationResult.conflictsDetected.length > 0 && (
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-warning-foreground flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm text-foreground">
                  Aksiya Qaydaları Arasında Konflikt Aşkarlanmışdır
                </h4>
                <ul className="list-disc list-inside text-xs mt-1.5 space-y-1 text-muted-foreground">
                  {simulationResult.conflictsDetected.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Context & Totals */}
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Simulyasiya Parametrləri
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Filial Seçimi
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background p-2 text-foreground"
                >
                  <option value="branch-1">Mall 28 Filialı</option>
                  <option value="branch-2">Gənclik Mall Filialı</option>
                  <option value="branch-3">Dəniz Mall Filialı</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Müştəri Loyallıq Dərəcəsi
                </label>
                <select
                  value={customerTier}
                  onChange={(e) => setCustomerTier(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background p-2 text-foreground"
                >
                  <option value="bronze">Bürünc (Standart)</option>
                  <option value="silver">Gümüş (Silver)</option>
                  <option value="gold">Qızıl (Gold)</option>
                  <option value="platinum">Platin (Platinum)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Promokod (İstəyə görə)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="Məs: NOVRUZ2026"
                    className="flex-1 text-xs rounded-md border border-input bg-background p-2 font-mono uppercase"
                  />
                  {promoCodeInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPromoCodeInput('')}
                      className="text-xs px-2"
                    >
                      Təmizlə
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Applied Rules Order */}
          <Card className="p-4 space-y-3">
            <h4 className="font-semibold text-sm text-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                Tətbiq Edilən Qaydalar (İcra Ardıcıllığı)
              </span>
              <Badge variant="outline" className="text-xs">
                {simulationResult.appliedRules.length}
              </Badge>
            </h4>

            {simulationResult.appliedRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Səbət və şərtlərə uyğun tətbiq edilən heç bir aksiya qaydası yoxdur.
              </p>
            ) : (
              <div className="space-y-2">
                {simulationResult.appliedRules.map((app, idx) => (
                  <div
                    key={app.ruleId}
                    className="p-2.5 rounded border border-border bg-muted/30 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <span className="h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        {app.ruleName}
                      </span>
                      <span className="font-mono font-bold text-success">
                        -{formatMoney(app.discountAmountQapik)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                      <span>Kod: {app.ruleCode}</span>
                      <span>•</span>
                      <span>Prioritet: #{app.priorityRank}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Totals Summary */}
          <Card className="p-4 space-y-3 bg-muted/20">
            <h4 className="font-semibold text-sm text-foreground">Yekun Hesablama</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>İlkin Cəm:</span>
                <span className="font-mono">{formatMoney(simulationResult.subtotalQapik)}</span>
              </div>
              <div className="flex justify-between text-success font-medium">
                <span>Ümumi Endirim:</span>
                <span className="font-mono">-{formatMoney(simulationResult.totalDiscountQapik)}</span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between items-baseline font-bold text-base text-foreground">
                <span>Ödəniləcək Məbləğ:</span>
                <span className="font-mono text-primary text-lg">
                  {formatMoney(simulationResult.finalPayableQapik)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
