import { t } from "../shared/i18n";
import { Component, type ReactNode } from "react";
import { Button } from "../shared/ui/button";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Renderer failed to display the workspace.", error); }
  render() {
    if (this.state.failed) return <main className="flex h-dvh bg-background items-center justify-center p-8">
      <div className="max-w-md"><h1 className="type-page">{t.renderFailedTitle}</h1>
      <p className="type-body mt-3 text-muted-foreground">{t.renderFailedBody}</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>{t.reload}</Button></div>
    </main>;
    return this.props.children;
  }
}
