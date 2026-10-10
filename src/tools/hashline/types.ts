// 移植自 @d3ara1n/pi-hashline-edit 的 MIT 核心；来源与许可见 README.md。
export interface Anchor {
  readonly line: number;
  readonly hash: string;
}

export type Edit =
  | { readonly op: "replace"; readonly anchor: Anchor; readonly end?: Anchor; readonly body: string[] }
  | { readonly op: "delete"; readonly anchor: Anchor; readonly end?: Anchor }
  | { readonly op: "insert_after"; readonly anchor: Anchor; readonly body: string[] }
  | { readonly op: "insert_before"; readonly anchor: Anchor; readonly body: string[] }
  | { readonly op: "append"; readonly body: string[] }
  | { readonly op: "prepend"; readonly body: string[] };

export type LineEnding = "lf" | "crlf";

export type AnchorRecovery =
  | { readonly kind: "found"; readonly newLine: number; readonly newHash: string }
  | {
      readonly kind: "ambiguous";
      readonly candidates: ReadonlyArray<{ readonly line: number; readonly hash: string }>;
    }
  | { readonly kind: "none" };

export interface AnchorFailure {
  readonly opIndex: number;
  readonly which: "anchor" | "end";
  readonly op: Edit["op"];
  readonly cited: Anchor;
  readonly recovery: AnchorRecovery;
  readonly current: { readonly hash: string; readonly content: string } | null;
}

export type ApplyFailure =
  | { readonly kind: "anchor"; readonly failures: readonly AnchorFailure[] }
  | { readonly kind: "range"; readonly message: string }
  | { readonly kind: "noop"; readonly message: string };

export type ApplyResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly changed: boolean;
      readonly touchedLines: readonly number[];
    }
  | { readonly ok: false; readonly failure: ApplyFailure };
