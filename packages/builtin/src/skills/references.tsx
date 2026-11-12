import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { IslandPanel, useI18n, useRendererCalls, useRendererIsland, type RendererIsland } from "@asterism-app/sdk/renderer";
import { skillUrl, type UiText } from "@asterism-app/sdk/contracts";
import { ReferenceCard, ReferenceChip, ReferenceSkillsProvider, type ReferenceSkills } from "@asterism-app/ui/reference-chip";
import { Alert, AlertDescription } from "@asterism-app/ui/ui/alert";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { failureDisplay } from "@asterism-app/ui/error-display";
import { ReadSkillFile, SkillList, type SkillEntry } from "./contract";
import { editorMessages } from "../messages/editor";

const TextViewer = lazy(() => import("../editor/TextViewer"));
const skillIcon = <BookOpen className="text-folder-violet" />;

/** Mounted when the hover card opens, so each hover reads the current catalog. */
function SkillCard({ name, path }: { name: string; path: string | undefined }) {
  const calls = useRendererCalls();
  const [read, setRead] = useState<{ status: "loading" } | { status: "ready"; skill: SkillEntry | null } | { status: "error"; error: UiText }>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    calls.invoke(SkillList, {}, { signal: controller.signal }).then(
      skills => { if (!controller.signal.aborted) setRead({ status: "ready", skill: skills.find(skill => skill.name === name) ?? null }); },
      error => { if (!controller.signal.aborted) setRead({ status: "error", error: failureDisplay(error, commonMessages.referenceUnavailable) }); });
    return () => controller.abort();
  }, [calls, name]);
  const skill = read.status === "ready" ? read.skill : null;
  return <ReferenceCard icon={skillIcon} title={name} loading={read.status === "loading"}
    missing={read.status === "ready" && !skill} error={read.status === "error" ? read.error : null}
    description={skill?.description} details={[path, skill?.source.id]} />;
}

function openSkillFile(island: RendererIsland, name: string, path: string | undefined, origin: HTMLElement) {
  const file = path ?? "SKILL.md";
  return island.open({ key: `skill:${name}:${file}`, label: file, size: "content", origin,
    render: () => <SkillReferences><SkillFile name={name} path={file} /></SkillReferences> });
}

/**
 * Skill reference behavior for Markdown and composer chips below this point: hover cards read the catalog,
 * and opening shows the file in a read-only island owned by the containing island.
 */
export function SkillReferences({ children }: { children: ReactNode }) {
  const island = useRendererIsland();
  const value = useMemo<ReferenceSkills>(() => ({
    Card: SkillCard,
    open: (name, path, origin) => openSkillFile(island, name, path, origin),
  }), [island]);
  return <ReferenceSkillsProvider value={value}>{children}</ReferenceSkillsProvider>;
}

function SkillFile({ name, path }: { name: string; path: string }) {
  const i18n = useI18n();
  const calls = useRendererCalls();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<UiText | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    calls.invoke(ReadSkillFile, { name, path }, { signal: controller.signal }).then(
      file => { if (!controller.signal.aborted) setText(file.text); },
      failure => { if (!controller.signal.aborted) setError(failureDisplay(failure, editorMessages.readFailed)); });
    return () => controller.abort();
  }, [calls, name, path]);
  const source = <ReferenceChip href={skillUrl(name)} size="title">{name}</ReferenceChip>;
  const loading = <IslandPanel title={path} source={source}><p className="type-caption flex items-center gap-2" role="status">
    <Spinner />{i18n.text(commonMessages.loading)}</p></IslandPanel>;
  if (error) return <IslandPanel title={path} source={source}>
    <Alert variant="destructive"><AlertDescription>{i18n.text(error)}</AlertDescription></Alert>
  </IslandPanel>;
  return text === null ? loading : <Suspense fallback={loading}><TextViewer path={path} text={text} source={source} /></Suspense>;
}
