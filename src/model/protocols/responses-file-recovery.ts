import type { Body } from "../request-encoding.ts";

function object(value: unknown): Body | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Body : undefined;
}

/** Retry only a pre-stream HTTP rejection that identifies an attachment in the actual wire request. */
export async function responsesFileRetry(response: Response, body: BodyInit | null | undefined, signal: AbortSignal) {
  if (![400, 415, 422].includes(response.status) || typeof body !== "string" || signal.aborted ||
    response.headers.get("content-type")?.includes("text/event-stream")) return;
  let rejection: unknown;
  try { rejection = await response.clone().json(); }
  catch { return; }
  if (signal.aborted) return;
  const param = object(object(rejection)?.error)?.param;
  if (typeof param !== "string") return;
  const path = /^input\[(\d+)\]\.content\[(\d+)\](?:\.(?:type|file_data|file_id|file_url|filename|image_url))?$/.exec(param);
  if (!path) return;

  const request = object(JSON.parse(body));
  if (!Array.isArray(request?.input)) return;
  const message = object(request.input[Number(path[1])]);
  if (message?.role !== "user" || !Array.isArray(message.content)) return;
  const index = Number(path[2]);
  const part = object(message.content[index]);
  if (part?.type !== "input_file" && part?.type !== "input_image") return;

  const data = part.type === "input_file" ? part.file_data : part.image_url;
  const media = typeof data === "string" ? /^data:([^;,]+)[;,]/.exec(data)?.[1] : undefined;
  const label = typeof part.filename === "string" ? [JSON.stringify(part.filename), media && `(${media})`].filter(Boolean).join(" ")
    : media ?? (part.type === "input_image" ? "image" : "file");
  message.content[index] = { type: "input_text", text: `[Attachment ${label} was rejected by the provider. Its contents were not provided in this retry.]` };
  return { body: JSON.stringify(request), label };
}
