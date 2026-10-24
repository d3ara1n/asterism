import { commonMessages } from "@atelier/ui/messages/common";
import { useI18n } from "../shared/i18n";
import { FailureScreen } from "./FailureScreen";

import { Component, type ReactNode } from "react";

/** 渲染异常兜底：显示可复制的错误与组件栈；重新加载回到首页，已保存的工作从持久化读取。 */
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
    return <RenderFailure details={details} />;
  }
}

function RenderFailure({ details }: { details: string }) {
  const i18n = useI18n();
  return <FailureScreen title={i18n.text(commonMessages.renderFailedTitle)} body={i18n.text(commonMessages.renderFailedBody)}
    details={details} actions={[{ label: i18n.text(commonMessages.reload), run: () => window.location.reload() }]} />;
}
