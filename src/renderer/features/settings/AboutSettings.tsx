import { useId, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Separator } from "@asterism-app/ui/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import appIcon from "../../../../assets/icon/asterism.svg";
import { applicationId } from "../../../shared/application";
import { appMessages } from "../../messages/app";
import { settingsMessages } from "../../messages/settings";
import { updatesMessages as messages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
import { useUpdates } from "../updates/state";
import { UpdateAction, UpdateStatus, UpdateVersions } from "../updates/controls";
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
    <Separator className="mt-6" />
    <ChannelRow />
    <Separator />
    <Row label={i18n.text(settingsMessages.aboutIdentity)}>
      <code className="type-code select-all text-xs text-muted-foreground">{applicationId}</code>
      <CopyIdentity />
    </Row>
    <Separator />
    <Row label={i18n.text(settingsMessages.aboutLogs)}>
      <Button size="sm" variant="outline" onClick={() => void window.host.openLogs().then(error => { if (error) console.error(`Log folder could not be opened: ${error}`); })}>
        {i18n.text(settingsMessages.aboutOpenLogs)}</Button>
    </Row>
  </div>;
}

/** The single visual focus for update state: versions, action, status, and progress share one subdued surface, replacing content by state. */
function UpdatePanel() {
  const i18n = useI18n();
  const labelId = useId();
  return <section className="rounded-lg bg-muted px-5 py-4" aria-labelledby={labelId}>
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h3 id={labelId} className="type-label">{i18n.text(messages.currentVersion)}</h3>
        <div className="mt-1"><UpdateVersions /></div>
      </div>
      <UpdateAction />
    </div>
    <div className="mt-4"><UpdateStatus /></div>
  </section>;
}

/** Update channel: stable releases or including prereleases; takes effect immediately. */
function ChannelRow() {
  const i18n = useI18n();
  const { state, saving, installing, set } = useUpdates();
  const prerelease = state?.includePrerelease ?? false;
  return <Row label={i18n.text(messages.channel)}>
    <ToggleGroup type="single" variant="outline" size="sm" aria-label={i18n.text(messages.channel)}
      value={state ? (prerelease ? "prerelease" : "stable") : ""} disabled={!state || saving || installing}
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
