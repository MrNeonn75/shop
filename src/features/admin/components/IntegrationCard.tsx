import React, { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { IntegrationCardItem } from '../types/systemSettings';
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Activity,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface IntegrationCardProps {
  integration: IntegrationCardItem;
  onTestConnection: (id: string) => Promise<{ success: boolean; message: string; latencyMs: number }>;
  onConfigureClick?: (integration: IntegrationCardItem) => void;
}

export const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integration,
  onTestConnection,
  onConfigureClick,
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const isConfigured = integration.status !== 'Konfiqurasiya olunmayıb';

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection(integration.id);
      setTestResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bağlantı xətası baş verdi';
      setTestResult({
        success: false,
        message: msg,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden border-border transition-shadow hover:shadow-xs">
      <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-4">
        {/* Header & Status */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-semibold text-foreground text-sm leading-snug">
                {integration.name}
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Provayder: <strong className="text-foreground">{integration.provider}</strong>
              </p>
            </div>

            {integration.status === 'Aktiv' ? (
              <Badge variant="default" size="sm" className="bg-emerald-600 shrink-0 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Aktiv
              </Badge>
            ) : integration.status === 'Xəta' ? (
              <Badge variant="danger" size="sm" className="shrink-0 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Xəta
              </Badge>
            ) : (
              <Badge variant="outline" size="sm" className="shrink-0 text-muted-foreground border-dashed">
                <HelpCircle className="h-3 w-3 mr-1" />
                Konfiqurasiya olunmayıb
              </Badge>
            )}
          </div>

          {/* Sync status */}
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
            <Activity className="h-3.5 w-3.5 text-bh-accent shrink-0" />
            <span>
              Son Sinxronizasiya:{' '}
              {integration.lastSyncAt ? (
                <strong className="text-foreground font-mono">{integration.lastSyncAt}</strong>
              ) : (
                <span className="italic">Heç vaxt sinxronizasiya olunmayıb</span>
              )}
            </span>
          </div>
        </div>

        {/* Masked Credentials Display */}
        <div className="bg-muted/40 p-2.5 rounded-md border border-border text-[11px] space-y-1.5 font-mono">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-sans font-semibold">
            <Lock className="h-3 w-3" />
            <span>Maskalanmış Təhlükəsiz Giriş Məlumatları (Write-Only):</span>
          </div>
          {Object.entries(integration.maskedCredentials).map(([key, val]) => (
            <div key={key} className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground font-sans capitalize">{key}:</span>
              <span className="bg-background px-1.5 py-0.5 rounded border border-border text-foreground font-mono">
                {val}
              </span>
            </div>
          ))}
        </div>

        {/* Recent calls log */}
        {integration.recentCalls.length > 0 && (
          <div className="text-[10px] space-y-1">
            <span className="font-semibold text-muted-foreground">Son Sorğular:</span>
            <div className="space-y-1">
              {integration.recentCalls.slice(0, 2).map((call, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-muted-foreground bg-card p-1 rounded border border-border font-mono text-[10px]"
                >
                  <span className="truncate max-w-[140px]">{call.endpoint}</span>
                  <span className={call.status.includes('200') ? 'text-emerald-500' : 'text-destructive'}>
                    {call.status} ({call.latencyMs}ms)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Result Feedback */}
        {testResult && (
          <div
            className={`p-2 rounded text-xs leading-tight border ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}
          >
            {testResult.message}
          </div>
        )}

        {/* Actions Toolbar */}
        <div className="flex items-center justify-between pt-2 border-t border-border gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !isConfigured}
            className="text-xs"
            title={!isConfigured ? 'Konfiqurasiya olunmadığı üçün deaktivdir' : 'Əlaqəni yoxla'}
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${testing ? 'animate-spin' : ''}`} />
            Bağlantını Yoxla
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onConfigureClick && onConfigureClick(integration)}
            className="text-xs"
          >
            Tənzimlə
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
