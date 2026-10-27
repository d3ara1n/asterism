import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CircleArrowUp, Copy } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Progress } from "@asterism-app/ui/ui/progress";
import { Separator } from "@asterism-app/ui/ui/separator";
import { StatusIcon, type StatusTone } from "@asterism-app/ui/ui/status";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import appIcon from "../../../../assets/icon/asterism.svg";
import { applicationId } from "../../../shared/application";
import { appMessages } from "../../messages/app";
import { settingsMessages } from "../../messages/settings";
import { updatesMessages as messages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { fadeTransition } from "../../shared/weave/motion";
import { toast } from "../../shared/toast";
import { useUpdates } from "../updates/state";
import { UpdateAction, UpdateError, UpdateNotesLink, useUpdateSummary } from "../updates/controls";
import { Row } from "./layout";

/** About page: the application identity card (icon, name, version) presents update state, with secondary information in compact rows afterward. */
export function AboutSettings() {
  const i18n = useI18n();
  return <div className="pb-2">
    <header className="flex flex-col items-center pt-2 pb-8 text-center">
      <img src={appIcon} alt="" className="size-24 select-none" draggable={false} />
      <p className="type-page mt-3">{i18n.formatMessage(appMessages.appName)}</p>
      <p className="type-caption mt-1">{i18n.text(settingsMessages.aboutSummary)}</p>
    </header>
    <UpdatePanel />
    <p className="type-caption mx-auto max-w-prose px-1 py-6 text-center">{i18n.text(settingsMessages.aboutBody)}</p>
    <Separator />
    <ChannelRow />
    <Separator />
    <Row label={i18n.text(settingsMessages.aboutIdentity)}>
      <code className="type-code select-all text-xs text-muted-foreground">{applicationId}</code>
      <CopyIdentity />
    </Row>
    <Separator />
    <Row label={i18n.text(settingsMessages.aboutLogs)} hint={i18n.text(settingsMessages.aboutLogsHint)}>
      <Button size="sm" variant="outline" onClick={() => void window.host.openLogs().then(error => { if (error) console.error(`Log folder could not be opened: ${error}`); })}>
        {i18n.text(settingsMessages.aboutOpenLogs)}</Button>
    </Row>
  </div>;
}

/** The single visual focus for update state: current version, target version, status row, and progress share one subdued surface, replacing content by state. */
function UpdatePanel() {
  const i18n = useI18n();
  const { state, failure } = useUpdates();
  const summary = useUpdateSummary();
  const labelId = useId();
  const status = failure ? "error" : !state ? null : !state.enabled ? "unavailable" : state.status;
  const tone: StatusTone = status === "error" ? "error" : status === "checking" || status === "downloading" ? "progress"
    : status === "current" || status === "ready" ? "success" : "neutral";

  return <section className="rounded-lg bg-muted px-5 py-4" aria-labelledby={labelId}>
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h3 id={labelId} className="type-label">{i18n.text(messages.currentVersion)}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="type-display">{state?.version ?? "…"}</span>
          {state?.availableVersion && <>
            <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{i18n.text(messages.nextVersion)}</span>
            <span className="type-display text-primary-text">{state.availableVersion}</span>
          </>}
        </p>
      </div>
      <UpdateAction />
    </div>
    <div className="mt-4 space-y-2">
      {/* UpdateError handles failure explanations and original errors (role=alert); the status row represents only other states to avoid repeating the same message. */}
      <div role="status" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {status !== "error" && <motion.p key={status ?? "loading"} className="type-body flex min-h-5 items-center gap-2"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fadeTransition}>
            {status && <StatusIcon tone={tone} icon={status === "ready" ? CircleArrowUp : undefined} className="size-4 shrink-0" />}
            <span className="min-w-0 break-words">{summary}</span>
          </motion.p>}
        </AnimatePresence>
      </div>
      {state?.status === "downloading" && <Progress value={state.progress} aria-label={i18n.text(messages.title)} className="h-1.5" />}
      {state?.status === "ready" && <p className="type-caption">{i18n.text(messages.installHint)}</p>}
      <UpdateNotesLink />
      <UpdateError />
    </div>
  </section>;
}

/** Update channel: stable releases or including prereleases; takes effect immediately, with the description following the selected channel. */
function ChannelRow() {
  const i18n = useI18n();
  const { state, saving, set } = useUpdates();
  const prerelease = state?.includePrerelease ?? false;
  return <Row label={i18n.text(messages.channel)} hint={i18n.text(prerelease ? messages.channelPrereleaseHint : messages.channelStableHint)}>
    <ToggleGroup type="single" variant="outline" size="sm" aria-label={i18n.text(messages.channel)}
      value={state ? (prerelease ? "prerelease" : "stable") : ""} disabled={!state || saving}
      onValueChange={value => { if (value) void set(value === "prerelease"); }}>
      <ToggleGroupItem value="stable">{i18n.text(messages.channelStable)}</ToggleGroupItem>
      <ToggleGroupItem value="prerelease">{i18n.text(messages.channelPrerelease)}</ToggleGroupItem>
    </ToggleGroup>
  </Row>;
}

/** Copy application identity: report the result through a transient notification and disable while pending to prevent duplicate triggers. */
function CopyIdentity() {
  const i18n = useI18n();
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(applicationId);
      toast.success(i18n.text(settingsMessages.aboutIdentityCopied));
    } catch (error) {
      console.error("Application ID could not be copied.", error);
      toast.error(i18n.text(settingsMessages.aboutIdentityCopyFailed));
    } finally {
      setCopying(false);
    }
  };
  return <IconButton size="icon-xs" label={i18n.text(settingsMessages.aboutCopyIdentity)} disabled={copying} onClick={() => { void copy(); }}>
    <Copy />
  </IconButton>;
}
