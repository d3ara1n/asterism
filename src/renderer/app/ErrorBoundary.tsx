import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Renderer failed to display the workspace.", error); }
  render() {
    if (this.state.failed) return <main className="flex h-dvh items-center justify-center p-8">
      <div className="max-w-md"><h1 className="text-xl font-semibold">The workspace could not be displayed</h1>
      <p className="mt-3 text-sm text-muted-foreground">Reload the window to read your saved work again. · 重新加载窗口以读取已保存的工作。</p>
      <button className="mt-6 rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>Reload · 重新加载</button></div>
    </main>;
    return this.props.children;
  }
}
