import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PosErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('POS Terminal Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 rounded-full bg-red-900/40 text-red-400 flex items-center justify-center mb-4 border border-red-500">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">POS Terminal Xətası Baş Verdi</h1>
          <p className="text-zinc-400 max-w-md text-sm mb-6">
            Kassa sistemi gözlənilməz xəta ilə qarşılaşdı. Aktiv səbətiniz və kassa məlumatlarınız
            yerli yaddaşda qorunur. Terminalı bərpa etmək üçün yeniləyin.
          </p>
          <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs font-mono text-zinc-300 max-w-lg mb-6 break-all">
            {this.state.error?.message || 'Bilinməyən sistem xətası'}
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded hover:bg-zinc-200 transition-colors text-sm min-h-[48px]"
          >
            <RefreshCw className="w-4 h-4" />
            Terminalı Yenidən Başlat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
