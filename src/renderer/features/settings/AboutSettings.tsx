import { useEffect, useId, useState } from "react";
import { Copy, ExternalLink, Globe } from "lucide-react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Switch } from "@asterism-app/ui/ui/switch";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@asterism-app/ui/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import appIcon from "../../../../assets/icon/asterism.svg";
import darkAppIcon from "../../../../assets/icon/asterism-dark.svg";
import type { CrashReportsState } from "../../../shared/crash-reports";
import { applicationDeveloper, applicationId, applicationLicense, applicationRepository } from "../../../shared/application";
import { appMessages } from "../../messages/app";
import { settingsMessages } from "../../messages/settings";
import { updatesMessages as messages } from "../../messages/updates";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/toast";
import { useUpdates } from "../updates/state";
import { UpdateAction, UpdateStatus, UpdateVersions } from "../updates/controls";
import { Row } from "@asterism-app/ui/settings-layout";

/** About page: the application identity card (icon, name, version) presents update state, with secondary information in compact rows afterward. */
export function AboutSettings() {
  const i18n = useI18n();
  return <div className="pb-2">
    <header className="flex flex-col items-center pt-2 pb-8 text-center">
      <img src={appIcon} alt="" className="size-24 select-none dark:hidden" draggable={false} />
      <img src={darkAppIcon} alt="" className="hidden size-24 select-none dark:block" draggable={false} />
      <p className="type-page mt-3">{i18n.formatMessage(appMessages.appName)}</p>
      <p className="type-caption mt-1">{i18n.text(settingsMessages.aboutSummary)}</p>
    </header>
    <UpdatePanel />
    <ItemGroup className="surface-group mt-6">
      <ChannelRow />
      <ItemSeparator />
      <Row label={i18n.text(settingsMessages.aboutIdentity)}>
        <code className="type-code select-all text-xs text-muted-foreground">{applicationId}</code>
        <CopyIdentity />
      </Row>
      <ItemSeparator />
      <CrashReportsRow />
      <ItemSeparator />
      <Row label={i18n.text(settingsMessages.aboutLogs)}>
        <Button size="sm" variant="outline" onClick={() => void window.host.openLogs().then(error => { if (error) console.error(`Log folder could not be opened: ${error}`); })}>
          {i18n.text(settingsMessages.aboutOpenLogs)}</Button>
      </Row>
    </ItemGroup>
    <ItemGroup className="surface-group mt-6" aria-label={i18n.text(settingsMessages.aboutDeveloper)}>
      <DeveloperRow />
      <ItemSeparator />
      <SourceRow />
    </ItemGroup>
  </div>;
}

const githubProfile = `https://github.com/${applicationDeveloper.handle}`;
const repositoryUrl = `https://github.com/${applicationRepository.owner}/${applicationRepository.name}`;

/** Developer identity: the GitHub avatar loads remotely so the image is not redistributed with the application; offline, the initial stands in. */
function DeveloperRow() {
  const i18n = useI18n();
  const [avatarFailed, setAvatarFailed] = useState(false);
  return <Item>
    <ItemMedia className="size-9 overflow-hidden rounded-full bg-muted">
      {avatarFailed
        ? <span className="type-label text-muted-foreground" aria-hidden="true">{applicationDeveloper.name.slice(0, 1)}</span>
        : <img src={`${githubProfile}.png?size=96`} alt="" className="size-full select-none object-cover" draggable={false}
          referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />}
    </ItemMedia>
    <ItemContent>
      <ItemTitle>{applicationDeveloper.name}</ItemTitle>
      <ItemDescription>{i18n.text(settingsMessages.aboutDeveloper)}</ItemDescription>
    </ItemContent>
    <ItemActions>
      <IconButton label={i18n.text(settingsMessages.aboutDeveloperGitHub)} tooltip={`github.com/${applicationDeveloper.handle}`} asChild>
        <a href={githubProfile} target="_blank" rel="noopener noreferrer"><GitHubMark /></a>
      </IconButton>
      <IconButton label={i18n.text(settingsMessages.aboutDeveloperWebsite)} tooltip={new URL(applicationDeveloper.website).host} asChild>
        <a href={applicationDeveloper.website} target="_blank" rel="noopener noreferrer"><Globe /></a>
      </IconButton>
    </ItemActions>
  </Item>;
}

function SourceRow() {
  const i18n = useI18n();
  return <Row label={i18n.text(settingsMessages.aboutSource)}>
    <span className="type-caption">
      <code className="type-code text-xs">{applicationRepository.owner}/{applicationRepository.name}</code> · {applicationLicense}
    </span>
    <IconButton size="icon-xs" label={i18n.text(settingsMessages.aboutSourceOpen)} asChild>
      <a href={repositoryUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
    </IconButton>
  </Row>;
}

/** GitHub's mark; Lucide no longer ships brand icons. */
function GitHubMark() {
  return <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
  </svg>;
}

function CrashReportsRow() {
  const i18n = useI18n();
  const [state, setState] = useState<CrashReportsState>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    void window.host.crashReports.get().then(value => { if (mounted) setState(value); }, error => console.error("Crash reporting preference could not be loaded.", error));
    return () => { mounted = false; };
  }, []);
  const setEnabled = async (enabled: boolean) => {
    setSaving(true);
    try { setState(await window.host.crashReports.set(enabled)); }
    catch (error) {
      console.error("Crash reporting preference could not be saved.", error);
      toast.error(i18n.text(settingsMessages.crashReportsSaveFailed));
    } finally { setSaving(false); }
  };
  const label = i18n.text(settingsMessages.crashReports);
  return <Row label={label} hint={i18n.text(settingsMessages.crashReportsHint)}>
    {state?.restartRequired && <span className="type-caption">{i18n.text(settingsMessages.crashReportsRestart)}</span>}
    <Switch aria-label={label} checked={state?.enabled ?? false} disabled={!state || saving}
      onCheckedChange={enabled => { void setEnabled(enabled); }} />
  </Row>;
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
    <ToggleGroup type="single" variant="segmented" size="sm" aria-label={i18n.text(messages.channel)}
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
