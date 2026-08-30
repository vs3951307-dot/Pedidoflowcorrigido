"use client";

import * as React from "react";

export class ErrorBoundary extends React.Component<
  { fallback?: React.ReactNode; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] render failed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const mensagem =
        this.state.error instanceof Error
          ? this.state.error.message
          : this.state.error
          ? String(this.state.error)
          : "erro desconhecido";
      return (
        this.props.fallback ?? (
          <div className="rounded-xl border border-status-waiting-border bg-status-waiting-bg px-4 py-3 text-sm text-status-waiting">
            <p>Não foi possível carregar esta seção. Atualize a página para tentar novamente.</p>
            <p className="mt-1 break-words font-mono text-xs" title={mensagem}>
              erro: {mensagem}
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
