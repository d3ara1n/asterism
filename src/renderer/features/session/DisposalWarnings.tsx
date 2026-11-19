import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import type { DisposalWarnings } from "./disposal";

/** Shared confirmation feedback; the owning action labels an explicit continue path when the read fails. */
export function DisposalWarningsNotice({ state }: { state: DisposalWarnings }) {
  const i18n = useI18n();
  return (
    <>
      {state.status === "loading" && (
        <p role="status" className="type-caption">
          {i18n.text(objectsMessages.disposalLoading)}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="type-caption text-destructive">
          {i18n.text(objectsMessages.disposalFailed)}
        </p>
      )}
      {state.warnings.map((item) => (
        <p
          key={item.objectId}
          className="type-body wrap-anywhere text-destructive"
        >
          {item.title}: {i18n.text(item.warning)}
        </p>
      ))}
    </>
  );
}
