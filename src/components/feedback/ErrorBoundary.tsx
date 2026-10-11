import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-background text-foreground">
          <div className="max-w-md w-full text-center space-y-4 p-8 border border-border rounded-xl bg-card shadow-lg">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertOctagon className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">Gözlənilməz Xəta Baş Verdi</h2>
              <p className="text-sm text-muted-foreground">
                Tətbiqin icrası zamanı kritik xəta yarandı. Sistem administratoruna məlumat ötürüldü.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 text-left rounded bg-muted/60 text-xs font-mono text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap">
                {this.state.error.message}
              </div>
            )}

            <div className="pt-2">
              <Button
                variant="default"
                onClick={this.handleReset}
                leftIcon={<RotateCcw className="h-4 w-4" />}
                className="w-full"
              >
                Səhifəni yeniləyin
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

