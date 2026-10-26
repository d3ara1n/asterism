import { ArrowUp, Bot, Settings } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type MessageDraft, AttachFiles, DraftFiles, DraftFileError, fileInputEvents, ModelChoices } from "@asterism/builtin/renderer";
import { defaultAgentPreset } from "@asterism/builtin-api/contracts";
import type { UiText } from "@asterism/sdk/contracts";

import type { ThinkingLevel } from "../../../shared/configuration";
import type { SessionCommand } from "../../../shared/session";
import { appMessages } from "../../messages/app";
import { commonMessages } from "@asterism/ui/messages/common";
import { homeMessages } from "../../messages/home";
import { ConfigurationChoice as Choice } from "@asterism/ui/ConfigurationChoice";
import { useI18n } from "../../shared/i18n";
import { BrandMark } from "@asterism/ui/ui/brand-mark";
import { StatusText } from "@asterism/ui/ui/status";
import { Button } from "@asterism/ui/ui/button";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { InputGroup, InputGroupTextarea, InputGroupAddon } from "@asterism/ui/ui/input-group";
import { useConfiguration } from "../configuration/state";
import { Showcase, showcaseSpell } from "../showcase/Showcase";
import type { TemplateSummary } from "../../../shared/templates";
import { TemplateCards } from "../templates/TemplateCards";
import type { SettingsCategoryId } from "../settings/SettingsPage";

export type StartInput = Omit<Extract<SessionCommand, { type: "start" }>, "type" | "submissionId" | "contentScopeId">;

/** 应用级草稿只保存显式覆盖；默认模型和等级在请求时解析。 */
export function HomePage({ active, draft, onSettings, ready, busy, submitError, onStart, templates, onTemplateStart, onTemplatesChanged }: {
  active: boolean; draft: MessageDraft; onSettings: (category: SettingsCategoryId) => void;
  ready: boolean; busy: boolean; submitError: UiText | null; onStart: (input: StartInput) => Promise<void>;
  templates: readonly TemplateSummary[]; onTemplateStart: (id: string) => Promise<UiText | null>; onTemplatesChanged: () => void;
}) {
  const i18n = useI18n();
  const inputState = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const { snapshot, readError } = useConfiguration(active);
  const initialized = useRef(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingLevel | null>(null);
  const [showcase, setShowcase] = useState(false);
  useEffect(() => {
    if (!snapshot) return;
    if (!initialized.current) {
      initialized.current = true;
      // 首页发起的唯一领域例外：默认选择内置 agent 预设。
      setAgentId(defaultAgentPreset);
      return;
    }
  }, [snapshot]);
  const agent = snapshot?.agents.find(item => item.id === agentId && item.enabled);
  const canSend = ready && !busy && !inputState.uploading && !!agent && (!!inputState.text.trim() || !!inputState.files.length);
  // 配置存在即表示用户已接触对应概念；引导进度独立于请求可用性。
  const guidance = !snapshot ? null
    : !snapshot.modelProviders.length ? { message: homeMessages.setupProvider, action: homeMessages.openProviders, category: "providers" as const }
    : !snapshot.models.length ? { message: homeMessages.setupModel, action: homeMessages.openModels, category: "providers" as const }
    : !snapshot.roles.some(role => role.model !== null) ? { message: homeMessages.setupRole, action: homeMessages.openRoles, category: "roles" as const }
    : null;
  return <div className="home-page"><div className="home-content">
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-8 flex flex-col items-center text-center">
        <BrandMark className="mb-4 size-12 text-primary" /><h1 className="type-page">{i18n.formatMessage(appMessages.appName)}</h1>
        <p className="type-body mt-2 text-muted-foreground">{i18n.formatMessage(homeMessages.homePrompt)}</p>
      </header>
      {/* 两层输入区：亮色输入表面在上，灰色选项托盘挂在下方；选项为紧凑的幽灵按钮 + 菜单，不用表单下拉框。 */}
      <form {...fileInputEvents(draft, busy || !ready)} onSubmit={event => {
        event.preventDefault();
        if (canSend) void onStart({ agent: agent!.id, model: modelId, thinking, parts: draft.parts() });
      }} aria-label={i18n.formatMessage(commonMessages.newConversation)} className="rounded-xl border bg-muted">
        <InputGroup className="rounded-xl border-0 border-b bg-card shadow-none">
          <label htmlFor="home-message" className="sr-only">{i18n.formatMessage(homeMessages.firstMessage)}</label>
          <InputGroupTextarea id="home-message" className="min-h-32 px-4 py-4" rows={4} maxLength={100_000}
            placeholder={i18n.formatMessage(homeMessages.homePlaceholder)} value={inputState.text} disabled={busy} onChange={event => draft.setText(event.target.value)} aria-describedby="home-availability"
            onKeyDown={event => {
              // 彩蛋：完整输入口令后回车打开组件展示，不进入命令系统。
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (inputState.text.trim() === showcaseSpell) { draft.setText(""); setShowcase(true); }
              else event.currentTarget.form?.requestSubmit();
            }} />
          <InputGroupAddon align="block-end" className="min-w-0 gap-1">
            <AttachFiles draft={draft} disabled={busy || !ready} />
            <DraftFiles draft={draft} disabled={busy} />
            <IconButton variant="default" className="rounded-full" label={i18n.formatMessage(commonMessages.sendMessage)} type="submit" disabled={!canSend} aria-describedby="home-availability"><ArrowUp /></IconButton>
          </InputGroupAddon>
        </InputGroup>
        <div className="flex min-w-0 flex-wrap items-center gap-0.5 px-1.5 py-1">
          <Choice icon={<Bot />} label={i18n.formatMessage(commonMessages.agent)} value={agent?.id ?? i18n.formatMessage(commonMessages.agent)} disabled={!snapshot || busy}
            selected={agent?.id ?? ""} onSelect={setAgentId}
            options={snapshot?.agents.filter(item => item.enabled).map(item => ({ value: item.id, label: item.id })) ?? []} />
          <ModelChoices configuration={snapshot} agent={agentId} model={modelId} thinking={thinking} disabled={busy}
            onModelChange={setModelId} onThinkingChange={setThinking} />
        </div>
      </form>
      <DraftFileError draft={draft} className="mt-2" />
      {(submitError || readError) && <p role="alert" className="mt-3 text-center"><StatusText tone="error">{i18n.text(submitError ?? readError ?? "")}</StatusText></p>}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <p id="home-availability" role="status" className="type-caption">{i18n.text(busy ? homeMessages.startingConversation
          : !ready ? commonMessages.statusUnavailable : !snapshot ? (readError ? commonMessages.statusUnavailable : commonMessages.loading)
          : guidance?.message ?? homeMessages.workbenchHint)}</p>
        {ready && !busy && guidance && <Button variant="ghost" size="sm" onClick={() => onSettings(guidance.category)}>
          <Settings />{i18n.text(guidance.action)}</Button>}
      </div>
    </div>
    <TemplateCards templates={templates} ready={ready} onStart={onTemplateStart} onChanged={onTemplatesChanged} />
    <Showcase open={showcase} onOpenChange={setShowcase} />
  </div></div>;
}
