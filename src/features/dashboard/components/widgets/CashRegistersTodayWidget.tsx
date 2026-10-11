import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { WidgetContainer } from '../WidgetContainer';
import { DashboardFilterParams, CashRegisterDetail } from '../../types';
import { dashboardRepository } from '../../../../shared/adapters';
import { formatMoney } from '../../../../shared/utils/formatters';
import { useExportCsv } from '../../../../shared/hooks/useExportCsv';
import { Badge } from '../../../../components/ui/Badge';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export interface CashRegistersTodayWidgetProps {
  filterParams: DashboardFilterParams;
  autoRefreshInterval?: number | false;
}

export const CashRegistersTodayWidget: React.FC<CashRegistersTodayWidgetProps> = ({
  filterParams,
  autoRefreshInterval,
}) => {
  const { exportToCsv } = useExportCsv<CashRegisterDetail>();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', 'cashRegistersStatus', filterParams],
    queryFn: () => dashboardRepository.getOperationsStatus(filterParams),
    refetchInterval: autoRefreshInterval || false,
  });

  const handleExport = () => {
    if (!data) return;
    exportToCsv(data.registers, {
      filename: `brand_house_kassa_veziyyeti_${filterParams.startDate}.csv`,
      columns: [
        { header: 'Kassa №', accessor: 'registerNumber' },
        { header: 'Filial', accessor: 'branchName' },
        { header: 'Kassir', accessor: 'cashierName' },
        { header: 'Gözlənilən Nağd (AZN)', accessor: (row) => (row.expectedCashQapik / 100).toFixed(2) },
        { header: 'Faktiki Nağd (AZN)', accessor: (row) => (row.actualCashQapik / 100).toFixed(2) },
        { header: 'Fərq / Kəsir (AZN)', accessor: (row) => (row.discrepancyQapik / 100).toFixed(2) },
        { header: 'Status', accessor: 'status' },
      ],
    });
  };

  const registers = data?.registers || [];
  const totalDiscrepancy = data?.totalCashDiscrepancyQapik || 0;

  return (
    <WidgetContainer
      title="Aktiv Kassalar və Kassa Balansı (Bugün)"
      subtitle="Açıq növbələr, kassa qalıqları və aşkar edilmiş fərqlər"
      infoTooltip="Günün əvvəlindən filial kassalarında vurulmuş çeklər, gözlənilən nağd və faktiki sayım nəticəsində yaranan fərqlər."
      drillDownUrl="/pos"
      drillDownLabel="Kassa Jurnalına Bax"
      isLoading={isLoading}
      isError={isError}
      isEmpty={!data || registers.length === 0}
      onRetry={() => refetch()}
      onExportCsv={handleExport}
      testId="widget-cash-registers-today"
      className="col-span-1"
    >
      <div className="space-y-3 py-1">
        {/* Total Discrepancy Banner */}
        <div className="p-2.5 rounded-md bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5">
            {totalDiscrepancy === 0 ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-danger" />
            )}
            Ümumi Kassa Fərqi:
          </span>
          <span
            className={`font-bold ${
              totalDiscrepancy === 0
                ? 'text-success'
                : totalDiscrepancy < 0
                  ? 'text-danger'
                  : 'text-warning'
            }`}
          >
            {formatMoney(totalDiscrepancy, true)}
          </span>
        </div>

        {/* Registers Table */}
        <div className="overflow-x-auto max-h-60">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-2">Kassa & Filial</th>
                <th className="p-2">Kassir</th>
                <th className="p-2 text-right">Gözlənilən</th>
                <th className="p-2 text-right">Fərq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {registers.map((reg) => (
                <tr key={reg.id} className="hover:bg-muted/40 transition-colors">
                  <td className="p-2 font-medium">
                    <div className="text-foreground">{reg.registerNumber}</div>
                    <div className="text-[10px] text-muted-foreground">{reg.branchName}</div>
                  </td>
                  <td className="p-2 text-muted-foreground">{reg.cashierName}</td>
                  <td className="p-2 text-right font-medium">
                    {formatMoney(reg.expectedCashQapik, true)}
                  </td>
                  <td className="p-2 text-right">
                    {reg.discrepancyQapik === 0 ? (
                      <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1 text-success">
                        Dəqiq
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm" className="text-[10px] py-0 px-1">
                        {formatMoney(reg.discrepancyQapik, true)}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </WidgetContainer>
  );
};

