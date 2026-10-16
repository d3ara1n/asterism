import { defineMessages } from "@atelier/sdk/contracts";
import { builtin } from "@atelier/builtin-api/contracts";

export const questionMessages = builtin.messages("en", defineMessages({
  title: { id: "questions.title", defaultMessage: "Question for you" },
  answer: { id: "questions.answer", defaultMessage: "Submit answer" },
  cancel: { id: "questions.cancel", defaultMessage: "Cancel question" },
  failed: { id: "questions.failed", defaultMessage: "Questions could not be loaded. Refresh to try again." },
  submitFailed: { id: "questions.submitFailed", defaultMessage: "Your answer could not be submitted. Your input has been kept; try again." },
  refresh: { id: "questions.refresh", defaultMessage: "Refresh" },
  waiting: { id: "questions.waiting", defaultMessage: "Waiting for your answer" },
}));
