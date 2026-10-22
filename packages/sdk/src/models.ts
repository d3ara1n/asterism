/** 模型协议共识：不依赖资源实现、代理配置或宿主适配器。 */
import type { Json } from "./json.ts";
import type { ModelInputPart } from "./model-input.ts";
import type { ContentReader } from "./content-runtime.ts";
import type { ToolOutcome, ToolInvocationInfo, ToolResult } from "./tool-result.ts";
import type { ResourceRef } from "./workspace.ts";
import type { RequestTiming } from "./model-records.ts";
import type { Presentation } from "./presentation.ts";

/** 全软件共用的标准等级；协议编码不改变公共取值。 */
export const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = typeof thinkingLevels[number];
export interface ModelTarget { role: string; model?: string; thinking?: ThinkingLevel }
export type PromptBlock =
  | { id: string; kind: "system"; from: string; text: string }
  | { id: string; kind: "agent"; role: string; text: string }
  | { id: string; kind: "context"; file: string; text: string };
export interface SystemPrompt { blocks: readonly PromptBlock[] }
/** 思考的 text 为协议交付的明文，summary 为独立摘要；两者可并存或为空，不相互填充。
 * continuation 只附带签名／密文等原生资料，由目标投影判断能否复用。
 */
export type ModelPart =
  | { kind: "thinking"; text: string; summary: string; continuation: Json }
  | { kind: "text"; text: string; continuation: Json }
  | { kind: "toolcall"; callId: string; name: string; arguments: Json; continuation: Json };
export type ModelItem =
  | { kind: "input" | "context"; parts: readonly ModelInputPart[] }
  // scope／adapter 约束原生资料，不是公共内容参与跨模型请求的门禁。
  | { kind: "output"; parts: ModelPart[]; scope: string; adapter: string }
  | { kind: "result"; callId: string; name: string; outcome: ToolOutcome };
export interface Usage {
  input: number | null; output: number | null; total: number | null;
  reasoning: number | null; cacheRead: number | null; cacheWrite: number | null;
}
export type StreamPart =
  | { id: string; kind: "text" | "thinking" }
  | { id: string; kind: "toolcall"; callId: string; name: string };
export type ModelEvent =
  | { type: "part.start"; part: StreamPart }
  | { type: "part.delta"; partId: string; delta: string; channel?: "summary" }
  | { type: "part.end"; partId: string; arguments?: Json; continuation?: Json }
  | { type: "finish"; reason: string; usage: Usage | null; responseId?: string; rawFinishReason?: string; source?: ModelSource; timing?: RequestTiming; response?: ModelResponse | null };
export type ModelSource = { model: string; adapter: string; scope: string };
export type ModelCompletion = {
  usage: Usage | null; finishReason: string; rawFinishReason: string | null; providerResponseId: string | null;
  timing?: RequestTiming;
  /** 由领域声明和消费的具型数据；公共层保留未知契约。 */
  extensions?: Presentation[];
};
/** 成型响应块；不是会话节点，时间线身份和保存由消费者提供。 */
export type ModelBlock = {
  responseId: string; requestParentId: string | null; ordinal: number; complete: boolean; continuation: Json; source: ModelSource;
  /** 终态随响应最高序号的实际块一次交付；其他块为 null。 */
  completion?: ModelCompletion | null;
} & (
  | { kind: "thinking"; text: string; summary: string }
  | { kind: "text"; text: string }
  | { kind: "toolcall"; callId: string; name: string; argumentsText: string; arguments: Json; outcome: ToolOutcome | null }
);
export type ModelLiveBlock = { id: string; responseId: string; ordinal: number } & (
  | { kind: "text"; text: string; endedAt: number | null }
  | { kind: "thinking"; text: string; startedAt: number; endedAt: number | null }
  /** input 阶段的 arguments 是宽容解析的展示预览，不能用于执行；其余阶段为完整参数。 */
  | { kind: "toolcall"; name: string; argumentsText: string; arguments: Json; state: "input" | "ready" | "executing";
      invocation: ToolInvocationInfo | null; result: Extract<ToolResult, { kind: "running" }> | null }
);
export type ModelRunEvent =
  | { type: "block"; block: ModelBlock }
  | { type: "progress"; blocks: readonly ModelLiveBlock[] }
  | { type: "diagnostic"; code: string; message: string; level: "error" | "warning" };
/** 同步交付执行事件；消费者保存成型记录，异常将停止执行，返回后不再交付。 */
export interface ModelRunObserver { event(event: ModelRunEvent): undefined }
/** 仅用于 HTTP 请求身份，不进入模型消息、历史或资源授权。 */
export interface ModelRequestIdentity {
  userAgent?: string;
  /** 同一会话稳定；无会话的单次调用可省略。 */
  sessionId?: string;
}
/** 本次真实 HTTP 响应的瞬态元信息；不包含请求凭据或正文，不自动写入历史。 */
export interface ModelResponse {
  connection: { id: string };
  endpoint: string;
  model: string;
  status: number;
  receivedAt: number;
  headers: Readonly<Record<string, string>>;
}
export interface ModelRunRequest {
  object: ResourceRef;
  /** 会话身份取自 object；调用方可声明自己的客户端身份。 */
  userAgent?: string;
  requestParentId: string | null;
  target: ModelTarget;
  system: SystemPrompt;
  messages: ModelItem[];
  /** 按名称收窄插件顶层工具及按真实链接选出的资源工具；不影响宿主固定入口。 */
  tools?: { allow?: readonly string[]; exclude?: readonly string[] };
  cache?: { expectHit: boolean };
  /** 最终请求准备完成后同步封装领域资料；随实际响应的 completion 交付。 */
  completionExtensions?: (context: ModelRequestContext) => readonly Presentation[];
  signal: AbortSignal;
  observer: ModelRunObserver;
}
export type ModelRunResult = {
  responseId: string | null; source: ModelSource | null; completion: ModelCompletion | null; tools: readonly ToolOutcome[];
  /** 本次调用最后收到的 HTTP 响应元信息；未收到时为 null，不进入响应块或历史。 */
  response: ModelResponse | null;
  /** 当次调用的实测计时；未取得终态时仍可用于瞬态反馈。 */
  timing: RequestTiming | null;
} & ({ reason: "completed" } | { reason: "cancelled" } | { reason: "failed"; code: string });
/** 最终请求的输入现场；独立副本供领域扩展生产者读取。 */
export interface ModelRequestContext {
  system: SystemPrompt;
  tools: readonly { name: string; description: string; parameters: Json }[];
}
export interface StreamRequest extends ModelRequestIdentity {
  target: ModelTarget;
  system: SystemPrompt;
  messages: ModelItem[];
  /** 本次补全的输出上限；与模型配置的上限取较小值。 */
  maxOutputTokens?: number;
  tools?: { name: string; description: string; parameters: Json }[];
  signal: AbortSignal;
}
export interface ModelInputOptions { content?: ContentReader }
export interface ModelServices {
  /** 检查显式请求输入与目标，不发送模型请求、不保存状态。 */
  validate(request: Pick<StreamRequest, "target" | "system" | "messages" | "signal" | "userAgent" | "sessionId">, options?: ModelInputOptions): Promise<void>;
  stream(request: StreamRequest, options?: ModelInputOptions): AsyncIterable<ModelEvent>;
  /** 一次请求及其工具批次；不保存历史，不推动下一次请求。 */
  run(request: ModelRunRequest): Promise<ModelRunResult>;
  roles(): readonly { id: string; name: string; description: string; hidden: boolean; model: string | null; thinking: ThinkingLevel | null }[];
  list(): readonly { model: string; provider: string; name: string; contextWindow: number | null; capabilities: { reasoning: boolean; tools: boolean; thinkingLevels: readonly ThinkingLevel[] } }[];
}
