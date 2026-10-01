import { t } from "../shared/i18n";
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Renderer failed to display the workspace.", error); }
  render() {
    if (this.state.failed) return <main className="flex h-dvh bg-background items-center justify-center p-8">
      <div className="max-w-md"><h1 className="type-page">{t.renderFailedTitle}</h1>
      <p className="type-body mt-3 text-muted-foreground">{t.renderFailedBody}</p>
      <button className="mt-6 h-7 rounded-control bg-primary px-2.5 text-sm font-medium text-primary-foreground" onClick={() => window.location.reload()}>{t.reload}</button></div>
    </main>;
    return this.props.children;
  }
}
