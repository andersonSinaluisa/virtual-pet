/*
 * Error Boundary genérico. Aísla fallos de una zona de la UI (por ejemplo la
 * escena 3D) sin afectar a la partida: el save lo gestiona SessionController.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
