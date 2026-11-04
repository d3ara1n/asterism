import { defineMessages } from "@asterism-app/sdk/contracts";
import { builtin } from "@asterism-app/builtin-api/contracts";

export const scheduleMessages = builtin.messages("en", defineMessages({
  timer: { id: "schedule.timer", defaultMessage: "Timer" },
  alarm: { id: "schedule.alarm", defaultMessage: "Alarm" },
  hours: { id: "schedule.hours", defaultMessage: "Hours" },
  minutes: { id: "schedule.minutes", defaultMessage: "Minutes" },
  seconds: { id: "schedule.seconds", defaultMessage: "Seconds" },
  message: { id: "schedule.message", defaultMessage: "Message" },
  repeat: { id: "schedule.repeat", defaultMessage: "Repeat" },
  time: { id: "schedule.time", defaultMessage: "Time" },
  date: { id: "schedule.date", defaultMessage: "Date" },
  nextOccurrence: { id: "schedule.nextOccurrence", defaultMessage: "Next occurrence" },
  once: { id: "schedule.once", defaultMessage: "Once" },
  enabled: { id: "schedule.enabled", defaultMessage: "Enabled" },
  start: { id: "schedule.start", defaultMessage: "Start" },
  pause: { id: "schedule.pause", defaultMessage: "Pause" },
  reset: { id: "schedule.reset", defaultMessage: "Reset" },
  edit: { id: "schedule.edit", defaultMessage: "Edit" },
  save: { id: "schedule.save", defaultMessage: "Save" },
  running: { id: "schedule.running", defaultMessage: "Running" },
  paused: { id: "schedule.paused", defaultMessage: "Paused" },
  finished: { id: "schedule.finished", defaultMessage: "Finished" },
  off: { id: "schedule.off", defaultMessage: "Off" },
  unavailable: { id: "schedule.unavailable", defaultMessage: "Schedule unavailable" },
  failed: { id: "schedule.failed", defaultMessage: "Could not update the schedule." },
}));
