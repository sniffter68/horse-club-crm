import React from 'react';

const _h = React.createElement;

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, { error: Error | null }> {
  // Explicit initialization avoids class-field compatibility helpers in the WebView bundle.
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return <div role="alert" className="p-4 text-rose-300 bg-neutral-900 min-h-screen">
      <h2 className="text-lg font-bold mb-2">Ошибка приложения</h2>
      <pre className="text-xs overflow-auto bg-black/50 p-2 rounded">{this.state.error.message}</pre>
      <pre className="text-[10px] overflow-auto mt-2 text-neutral-400">{this.state.error.stack}</pre>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-neutral-800 rounded">Перезагрузить</button>
    </div>;
  }
}
