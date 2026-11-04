import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

/**
 * React Error Boundary — Phase 6 Bug Buffer & UI Defense
 * Prevents any component runtime crash from unmounting the app and showing a blank white screen.
 * Displays a sleek dark-mode recovery HUD with detailed error info and instant session reload.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[VelatoAI ErrorBoundary Caught]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 antialiased font-sans">
          <div className="max-w-lg w-full bg-[#0E1614] border border-rose-500/40 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-rose-400" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-100">
                VelatoAI Runtime Recovery
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                A component error occurred, but zero-trust isolation was preserved.
              </p>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-lg border border-[#1A2824] text-left font-mono text-xs text-rose-300 max-h-40 overflow-y-auto">
              <div className="font-bold text-rose-400 mb-1">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown runtime error'}
              </div>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex gap-3 justify-center mt-2">
              <button
                onClick={this.handleReset}
                className="bg-[#00E676] hover:bg-[#00C853] text-[#070B0A] font-bold px-5 py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 transition-all "
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-500 mt-2">
              VelatoAI Autonomous Voice Payment Handover & PCI Isolation
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

