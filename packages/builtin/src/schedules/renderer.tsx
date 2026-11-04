import { AlarmClock, Timer as TimerIcon, Pause, Play, RotateCcw, Settings2, Power, PowerOff } from "lucide-react";
import { cardRenderer, creationEntry, toolRenderer, type RendererModule } from "@asterism-app/sdk/renderer";
import { scheduleMessages as messages } from "../messages/schedules";
import { scheduleCard as appearance } from "../shared/card-appearance";
import { Alarm, AlarmView, CreateAlarm, CreateTimer, Timer, TimerView, AlarmGet, AlarmSet, AlarmEnable, AlarmDisable,
  TimerGet, TimerSet, TimerStart, TimerPause, TimerReset } from "./contract";
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
  tools: [
    toolRenderer(TimerGet, { label: messages.timerGet, icon: <TimerIcon className="size-3.5" /> }),
    toolRenderer(TimerSet, { label: messages.timerSet, icon: <Settings2 className="size-3.5" /> }),
    toolRenderer(TimerStart, { label: messages.timerStart, icon: <Play className="size-3.5" /> }),
    toolRenderer(TimerPause, { label: messages.timerPause, icon: <Pause className="size-3.5" /> }),
    toolRenderer(TimerReset, { label: messages.timerReset, icon: <RotateCcw className="size-3.5" /> }),
    toolRenderer(AlarmGet, { label: messages.alarmGet, icon: <AlarmClock className="size-3.5" /> }),
    toolRenderer(AlarmSet, { label: messages.alarmSet, icon: <Settings2 className="size-3.5" /> }),
    toolRenderer(AlarmEnable, { label: messages.alarmEnable, icon: <Power className="size-3.5" /> }),
    toolRenderer(AlarmDisable, { label: messages.alarmDisable, icon: <PowerOff className="size-3.5" /> }),
  ],
} satisfies RendererModule;
