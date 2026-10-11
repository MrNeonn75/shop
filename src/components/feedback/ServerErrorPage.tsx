import React from 'react';
import { ServerCrash, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

export const ServerErrorPage: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full text-center space-y-5 p-8 border border-border rounded-xl bg-card shadow-sm">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-warning/10 text-warning">
          <ServerCrash className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <span className="text-4xl font-extrabold tracking-widest text-warning">500</span>
          <h2 className="text-xl font-bold tracking-tight">Server Xətası</h2>
          <p className="text-sm text-muted-foreground">
            Server daxili problemi səbəbindən sorğu icra edilə bilmədi. Zəhmət olmasa bir qədər sonra təkrar cəhd edin.
          </p>
        </div>

        <div className="pt-2">
          <Button
            variant="default"
            onClick={onRetry || (() => window.location.reload())}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Yenidən yoxlayın
          </Button>
        </div>
      </div>
    </div>
  );
};

