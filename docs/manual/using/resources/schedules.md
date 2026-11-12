# Understand Timer and Alarm reminders

Timer and Alarm resources deliver saved messages to Agents. Use a Timer for an elapsed delay, optionally repeated, and an Alarm for a recurring local clock time on selected weekdays. They provide a trigger for work, not a guarantee that the resulting task has completed or that a person has been notified outside Asterism.

## Timer: elapsed intervals are not clock appointments

A Timer measures an interval. Pausing preserves the time left; configuring it again restores the full duration. A paused timer is therefore different from a timer whose settings have just been saved.

A repeating Timer begins its next full interval when it actually fires. It is not anchored to a fixed wall-clock timetable. If an interruption delays one trigger, the later intervals follow the actual trigger rather than attempting to preserve every earlier planned occurrence. Choose an Alarm when the requirement is tied to a local clock time instead.

## Alarm: local clock times are not fixed-length intervals

An Alarm repeats on its selected weekdays using the computer's local calendar and clock. It is not a one-shot appointment or a fixed interval measured in hours. Local calendar behavior, including daylight-saving transitions, can therefore differ from a countdown of the same apparent length.

Enabling an Alarm chooses the next future occurrence. Turning it off and on again after today's chosen time does not request an immediate replay of that time. This differs from restoring an enabled Alarm whose saved deadline has become overdue.

## Arrange receiving separately from control

Make each receiving Agent available to the Timer or Alarm so the schedule can deliver to it. Making the schedule available to an Agent is the opposite relationship: it lets the Agent inspect and control the schedule. Use both directions when the Agent should receive reminders and manage them; control access alone does not make it a recipient.

A trigger delivers the saved message to every directly linked receiving Agent. Its direct effect is Agent input, not an external-chat message or a guarantee that a person saw a notification. If the work needs an external action, define that responsibility and provide the Agent with the relevant communication resource.

A running Agent receives the scheduled input at a request boundary rather than having its current model request rewritten midway through. The schedule advances without waiting for delivery or for the Agent's answer. Repeating reminders can consequently arrive while earlier work is still in progress. Define how the Agent should handle repeated prompts if the work takes longer than the interval.

## Availability determines when a reminder can run

Schedules can operate in the background while their session is running, even when another session is open or their cards are hidden. Session sleep and archival end that session's running resources. A deadline cannot wake a sleeping session, and no reminder executes while Asterism is shut down or the computer cannot run it.

Use the session's Keep awake setting when reminders must remain available instead of allowing automatic session sleep. This setting does not keep the computer awake or keep Asterism running after it is quit. Restoring a saved session is also not a replay of all the work that might have happened during its absence.

## Overdue reminders fire once on resumption

Active schedules save deadlines against the computer's clock, so time during session sleep, computer sleep, or application shutdown still counts. Changing that clock can affect when a deadline is due. When the resource runs again, an overdue Timer or Alarm fires once. It does not emit one message for every missed interval or weekday occurrence.

After that overdue trigger, a repeating Timer starts a fresh full interval from the actual trigger time. An Alarm chooses its next future selected weekday occurrence. Several overdue schedule resources each handle their own trigger; they are not collapsed into one shared reminder.

This explains a reminder arriving after reopening a session, or a long absence producing only one reminder from a repeating resource. If the task requires an account of every missed event, a Timer or Alarm alone is not that record.
