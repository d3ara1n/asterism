import { UnsupportedFunctionalityError, wrapLanguageModel } from "ai";
import type { LanguageModelV4 } from "../request-encoding.ts";

type Prompt = Parameters<LanguageModelV4["doStream"]>[0]["prompt"];

/** Only inline user files enter the SDK branch that throws this exact error. Tool output files and provider references use different encoders. */
function mask(prompt: Prompt, mediaTypes: ReadonlySet<string>) {
  const omitted: string[] = [];
  const messages: Prompt = prompt.map(message => message.role !== "user" ? message : {
    ...message, content: message.content.map(part => {
      if (part.type !== "file" || part.data.type !== "data" || typeof part.data.data === "string" || !mediaTypes.has(part.mediaType)) return part;
      const label = part.filename ? `${JSON.stringify(part.filename)} (${part.mediaType})` : part.mediaType;
      omitted.push(label);
      return { type: "text", text: `[Attachment ${label} was not sent: the current request adapter does not support this file type. The file contents were not provided.]` };
    }),
  });
  return { messages, omitted };
}

/** Re-encode a rejected prompt once, only before transport. Keep the SDK's checks and learn only from its actual rejection. */
export function withResponsesFileRecovery(model: LanguageModelV4, rejected: Set<string>, transportStarted: () => boolean,
  report: (omitted: readonly string[]) => void): LanguageModelV4 {
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    async wrapStream({ params, doStream }) {
      const first = mask(params.prompt, rejected);
      if (first.omitted.length) report(first.omitted);
      try {
        return await (first.omitted.length ? model.doStream({ ...params, prompt: first.messages }) : doStream());
      } catch (error) {
        if (transportStarted() || params.abortSignal?.aborted || !UnsupportedFunctionalityError.isInstance(error)) throw error;
        const mediaType = /^file part media type ([^\s/]+\/[^\s/]+)$/.exec(error.functionality)?.[1];
        if (!mediaType) throw error;
        const retry = mask(first.messages, new Set([mediaType]));
        if (!retry.omitted.length) throw error;
        rejected.add(mediaType);
        report([...first.omitted, ...retry.omitted]);
        return model.doStream({ ...params, prompt: retry.messages });
      }
    },
  } });
}
