import { createElement, type ComponentType, type ReactNode } from "react";
import type { UiText } from "./i18n.ts";
import type { Json } from "./json.ts";
import { reference, type ContractReference } from "./presentation.ts";
import type { RecordContract, SessionRecord } from "./records.ts";

/** Host-provided queries: records carry only identities, while the host resolves titles and type names using the full history. */
export interface RecordRenderContext {
  /** An object's title across the entire history; objects that were removed or belong to other branches can still be resolved. */
  resourceTitle(id: string): string;
  resourceLabel(kind: string): UiText;
  /** Format copy as plain text in the current UI language for composing summaries. */
  text(value: UiText): string;
  /** Contracts wrapping other records borrow the wrapped record's view; return null when unregistered or undecodable. */
  describe(record: SessionRecord): RecordView | null;
}
export interface RecordRowProps<D> { data: D; record: SessionRecord; label: string }
export interface RecordRendererDefinition<D> {
  /** Required plain-text summary for search, tooltips, and accessible names. */
  label(data: D, context: RecordRenderContext, record: SessionRecord): UiText;
  icon?: ReactNode | ((data: D, record: SessionRecord) => ReactNode);
  /** Optional summary row content; the host owns the row shell, including selection, position marker, source, and menu. */
  Row?: ComponentType<RecordRowProps<D>>;
}
export interface RecordView {
  label: UiText;
  icon?: ReactNode;
  /** Generate row content from the host-formatted summary; the host displays the summary text when omitted. */
  row?(label: string): ReactNode;
}
export interface RecordRenderer {
  contract: ContractReference;
  resolve(record: SessionRecord, context: RecordRenderContext): RecordView | null;
}

/** Declare history presentation by record contract; data enters the view only after contract decoding, otherwise the host displays an unknown record. */
export function recordRenderer<D extends Json>(contract: RecordContract<D>, definition: RecordRendererDefinition<D>): RecordRenderer {
  return { contract: reference(contract), resolve(record, context) {
    const decoded = contract.decode(record);
    if (decoded?.status !== "known") return null;
    const { data } = decoded;
    const { Row, icon } = definition;
    return {
      label: definition.label(data, context, record),
      icon: typeof icon === "function" ? icon(data, record) : icon,
      row: Row ? label => createElement(Row, { data, record, label }) : undefined,
    };
  } };
}
