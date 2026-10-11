import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../shared/utils/cn';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | unknown;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Xəta baş verdi',
  description = 'Məlumatları yükləyərkən gözlənilməz problem yarandı. Zəhmət olmasa yenidən cəhd edin.',
  error,
  onRetry,
  className,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const errorString =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack || ''}`
      : typeof error === 'string'
      ? error
      : JSON.stringify(error, null, 2);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 border border-danger/20 rounded-lg bg-danger/5',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger mb-4">
        <AlertCircle className="h-6 w-6" />
      </div>

      <h4 className="text-base font-semibold text-foreground">{title}</h4>
      <p className="mt-1.5 text-xs text-muted-foreground max-w-sm leading-relaxed">
        {description}
      </p>

      {onRetry && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Yenidən cəhd et
          </Button>
        </div>
      )}

      {Boolean(error) && (
        <div className="mt-4 w-full max-w-md text-left">
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mx-auto"
          >
            <span>Texniki detallar</span>
            {showDetails ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showDetails && (
            <pre className="mt-2 p-3 bg-muted rounded text-[11px] font-mono text-foreground overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
              {errorString}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

