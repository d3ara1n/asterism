# Use the counter plugin

The counter plugin adds a resource that stores an integer, a card for incrementing it, and a read operation for agents. It also has a settings page for choosing the increment step.

Create a Counter from the workbench creation menu. Its initial value is zero. Use Increment on the card to add the configured step. In plugin settings, change the step or read it back from the backend.

Link the counter resource to an agent to make its read operation available under that agent's tool policy. The operation reports the current value.

Incrementing saves the current value and records the change in history. Browsing an earlier history position does not restore the counter value. Removing the resource removes its current workbench presence while preserving its history.
