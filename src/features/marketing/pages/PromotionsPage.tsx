import React, { useState, useEffect } from 'react';
import { marketingRepository } from '../../../shared/adapters';
import { PromotionRule } from '../types';
import { PromotionSimulatorPanel } from '../components/PromotionSimulatorPanel';
import { PromotionRuleModal } from '../components/PromotionRuleModal';
import { formatMoney } from '../../../shared/utils/formatters';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  Tag,
  Plus,
  ArrowUp,
  ArrowDown,
  Calculator,
  Sliders,
  Layers,
} from 'lucide-react';

export const PromotionsPage: React.FC = () => {
  const [rules, setRules] = useState<PromotionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('rules');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<PromotionRule | undefined>(undefined);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await marketingRepository.getPromotionRules();
      setRules(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleCreateOrUpdate = async (ruleData: Partial<PromotionRule>) => {
    if (selectedRule) {
      await marketingRepository.updatePromotionRule(selectedRule.id, ruleData);
    } else {
      await marketingRepository.createPromotionRule(ruleData);
    }
    loadRules();
  };

  const handleMovePriority = async (ruleId: string, direction: 'up' | 'down') => {
    const sorted = [...rules].sort((a, b) => a.priorityRank - b.priorityRank);
    const index = sorted.findIndex((r) => r.id === ruleId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorted.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    // Swap
    const temp = sorted[index];
    sorted[index] = sorted[targetIndex];
    sorted[targetIndex] = temp;

    const orderedIds = sorted.map((r) => r.id);
    const updated = await marketingRepository.updateRulePriorities(orderedIds);
    setRules(updated);
  };

  const handleToggleActive = async (rule: PromotionRule) => {
    await marketingRepository.updatePromotionRule(rule.id, { isActive: !rule.isActive });
    loadRules();
  };

  const getRuleTypeLabel = (type: PromotionRule['ruleType']) => {
    switch (type) {
      case 'percentage':
        return 'Faiz Endirimi (%)';
      case 'fixed_amount':
        return 'Sabit Məbləğ (AZN)';
      case 'bogo':
        return 'BOGO (1 Al, 2-ci Güzəşt)';
      case 'quantity_tier':
        return 'Həcm / Say Pillələri';
      case 'bundle':
        return 'Dəst / Paket (Bundle)';
      case 'loyalty_discount':
        return 'Loyallıq VIP Endirimi';
      default:
        return type;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Sliders className="h-7 w-7 text-primary" />
            Endirim Qaydaları və Simulyator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prioritetə əsaslanan endirim iyerarxiyası, steking qaydaları və canlı səbət test paneli.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setSelectedRule(undefined);
              setIsModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Yeni Qayda Əlavə Et
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-md border border-border p-1 bg-muted/40 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`py-1.5 px-4 text-xs font-medium rounded transition-all flex items-center gap-2 ${
            activeTab === 'rules'
              ? 'bg-background shadow-xs text-foreground font-semibold'
              : 'text-muted-foreground'
          }`}
        >
          <Tag className="h-4 w-4" />
          Aksiya Qaydaları və Prioritetlər ({rules.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('simulator')}
          className={`py-1.5 px-4 text-xs font-medium rounded transition-all flex items-center gap-2 ${
            activeTab === 'simulator'
              ? 'bg-background shadow-xs text-primary font-semibold'
              : 'text-muted-foreground'
          }`}
        >
          <Calculator className="h-4 w-4" />
          Canlı Səbət Simulyatoru & Marja Monitorinqi
        </button>
      </div>

      {activeTab === 'rules' ? (
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 text-xs text-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Prioritet Prinsipi: Qaydalar ardıcıllıqla tətbiq olunur (#1 ən yüksək prioritetdir). Eksklüziv qaydalar digər aksiyaları dayandırır.
            </span>
            <Badge variant="outline" className="text-xs">
              {rules.filter((r) => r.isActive).length} Aktiv
            </Badge>
          </div>

          {/* Rules Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-3 py-3 text-center w-16">Prioritet</th>
                    <th className="px-4 py-3">Qayda Adı</th>
                    <th className="px-3 py-3">Növü və Şərti</th>
                    <th className="px-3 py-3">Tarix</th>
                    <th className="px-3 py-3">Steking / Eksklüziv</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Sıralama</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Yüklənir...
                      </td>
                    </tr>
                  ) : rules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Qayda tapılmadı.
                      </td>
                    </tr>
                  ) : (
                    rules
                      .sort((a, b) => a.priorityRank - b.priorityRank)
                      .map((rule, idx) => (
                      <tr key={rule.id} className="hover:bg-muted/20">
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                            #{rule.priorityRank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground">{rule.name}</div>
                          <div className="text-xs font-mono text-muted-foreground">{rule.code}</div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <Badge variant="outline" className="mb-1 text-[11px]">
                            {getRuleTypeLabel(rule.ruleType)}
                          </Badge>
                          <div className="text-muted-foreground">
                            {rule.discountPercent && `${rule.discountPercent}% endirim`}
                            {rule.discountAmountQapik &&
                              `${formatMoney(rule.discountAmountQapik)} endirim`}
                            {rule.bogoBuyQty &&
                              `${rule.bogoBuyQty} al, ${rule.bogoGetQty} ${rule.bogoDiscountPercent}% güzəşt`}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">
                          {rule.startDate} — {rule.endDate}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="flex flex-col gap-1">
                            {rule.isExclusive ? (
                              <Badge variant="danger" className="text-[10px] w-fit">
                                Eksklüziv (Tək)
                              </Badge>
                            ) : rule.canStack ? (
                              <Badge variant="success" className="text-[10px] w-fit">
                                Üst-üstə (Stackable)
                              </Badge>
                            ) : (
                              <Badge variant="neutral" className="text-[10px] w-fit">
                                Üst-üstə tətbiq olunmur
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(rule)}
                            className="inline-flex items-center"
                          >
                            {rule.isActive ? (
                              <Badge variant="success" className="cursor-pointer">
                                Aktiv
                              </Badge>
                            ) : (
                              <Badge variant="neutral" className="cursor-pointer">
                                Deaktiv
                              </Badge>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={idx === 0}
                              onClick={() => handleMovePriority(rule.id, 'up')}
                              className="h-7 w-7 p-0"
                              title="Prioriteti artır"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={idx === rules.length - 1}
                              onClick={() => handleMovePriority(rule.id, 'down')}
                              className="h-7 w-7 p-0"
                              title="Prioriteti azalt"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <PromotionSimulatorPanel rules={rules} />
      )}

      <PromotionRuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOrUpdate}
        initialData={selectedRule}
      />
    </div>
  );
};
