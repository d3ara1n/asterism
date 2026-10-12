import { commonMessages } from "../messages/common";
import { useI18n } from "../shared/i18n";
import { Component, type ReactNode } from "react";

/** 插槽级错误边界：单个视图崩溃只影响自身，不波及工作台或其他卡片。 */
export class SlotBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("A plugin view failed to render.", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ?? <UnavailableView />;
  }
}

function UnavailableView() {
  const i18n = useI18n();
  return <p className="type-caption p-3 text-muted-foreground">{i18n.text(commonMessages.renderFailedTitle)}</p>;
}
