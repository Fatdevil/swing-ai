import { Component } from 'react';

/**
 * ErrorBoundary — Catches React render errors
 * Prevents the entire app from going blank when a single component crashes.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-error text-3xl">warning</span>
          </div>
          <h2 className="font-headline text-xl font-bold text-on-surface mb-2">
            {this.props.language === 'en' ? 'Something went wrong' : 'Något gick fel'}
          </h2>
          <p className="text-on-surface-variant text-sm max-w-xs mb-6 leading-relaxed">
            {this.props.language === 'en' ? 'An unexpected crash occurred. Try reloading the page.' : 'En oväntad krasch inträffade. Prova att ladda om sidan.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-6 py-3 rounded-full bg-primary-fixed text-on-primary-fixed font-bold text-sm uppercase tracking-widest active:scale-95 transition-transform"
          >
            {this.props.language === 'en' ? 'Reload' : 'Ladda om'}
          </button>
          {this.state.error && (
            <details className="mt-6 text-left w-full max-w-sm">
              <summary className="text-on-surface-variant/40 text-xs cursor-pointer">
                {this.props.language === 'en' ? 'Technical info' : 'Teknisk info'}
              </summary>
              <pre className="mt-2 text-[10px] text-error/60 bg-surface-container rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
