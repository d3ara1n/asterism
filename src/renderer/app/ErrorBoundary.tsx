import { Button } from "@atelier/ui/ui/button";
import { commonMessages } from "@atelier/ui/messages/common";
import { useI18n } from "../shared/i18n";

import { Component, type ReactNode } from "react";

/** 渲染异常兜底：开发构建显示错误与组件栈；重新加载回到首页，已保存的工作从持久化读取。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string | null }> {
  state = { error: null as Error | null, stack: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Renderer failed to display the workspace.", error);
    this.setState({ stack: info.componentStack ?? null });
  }
  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n\n${error.stack ?? ""}${stack ? `\n\nComponent stack:${stack}` : ""}`;
    return <ErrorScreen details={details} />;
  }
}

function ErrorScreen({ details }: { details: string }) {
  const i18n = useI18n();
  return <main className="flex h-dvh items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl"><h1 className="type-page">{i18n.formatMessage(commonMessages.renderFailedTitle)}</h1>
        <p className="type-body mt-3 text-muted-foreground">{i18n.formatMessage(commonMessages.renderFailedBody)}</p>
        {import.meta.env.DEV && <pre className="mt-4 max-h-[50vh] select-text overflow-auto rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap">{details}</pre>}
        <div className="mt-6 flex gap-2">
          <Button onClick={() => window.location.reload()}>{i18n.formatMessage(commonMessages.reload)}</Button>
          {import.meta.env.DEV && <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(details); }}>Copy details</Button>}
        </div></div>
    </main>;
}
