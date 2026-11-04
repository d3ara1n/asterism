import { AlarmClock, Timer as TimerIcon } from "lucide-react";
import { cardRenderer, creationEntry, type RendererModule } from "@asterism-app/sdk/renderer";
import { scheduleMessages as messages } from "../messages/schedules";
import { scheduleCard as appearance } from "../shared/card-appearance";
import { Alarm, AlarmView, CreateAlarm, CreateTimer, Timer, TimerView } from "./contract";
import { TimerCard } from "./TimerCard";
import { AlarmCard } from "./AlarmCard";

export default {
  resources: [
    { kind: Timer.kind, label: messages.timer, icon: <TimerIcon className="size-4" />, card: appearance },
    { kind: Alarm.kind, label: messages.alarm, icon: <AlarmClock className="size-4" />, card: appearance },
  ],
  cards: [cardRenderer(TimerView, { ...appearance, Body: TimerCard }), cardRenderer(AlarmView, { ...appearance, Body: AlarmCard })],
  // New schedules start inactive with default settings; they are configured on the card's back.
  creations: [
    creationEntry(CreateTimer, { id: CreateTimer.id, label: messages.timer, icon: <TimerIcon className="size-4" />,
      group: "resources", triggers: { menu: { initialInput: {} } } }),
    creationEntry(CreateAlarm, { id: CreateAlarm.id, label: messages.alarm, icon: <AlarmClock className="size-4" />,
      group: "resources", triggers: { menu: { initialInput: {} } } }),
  ],
  tools: [],
} satisfies RendererModule;
