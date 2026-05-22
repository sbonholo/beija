import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px 24px',
          textAlign: 'center',
          gap: 18,
        }}
      >
        <div style={{ fontSize: 56 }}>😔</div>
        <h2 style={{ margin: 0 }}>Algo deu errado</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 320 }}>
          Encontramos um problema inesperado. Tente recarregar a página.
        </p>
        <button
          className="btn"
          style={{ maxWidth: 260 }}
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    );
  }
}
