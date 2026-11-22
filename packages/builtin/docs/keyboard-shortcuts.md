# Asterism Essentials keyboard shortcuts

These shortcuts belong to the bundled Asterism Essentials plugin (builtin). They depend on which view has keyboard focus: the Agent shortcut opens the Agent palette, not the application palette.

## Agent conversation

| Shortcut | What it does |
| --- | --- |
| `Ctrl+K` on all platforms | Open the Agent command palette. Focus the Agent view first, for example by clicking its message box. This is the Control key even on macOS. |
| `Enter` in the message box | Send the message. If the reference menu is open, select its highlighted entry instead. |
| `Shift+Enter` in the message box | Insert a line break without sending. |

In the Agent palette, type to filter, use the arrow keys to highlight a command, and press `Enter` to run it. In a submenu, press `Backspace` with an empty search to go back. Press `Esc` to close the palette.

For example, choose **Explain current conversation** to open Peek. In Peek’s question box, `Enter` sends the question and `Shift+Enter` inserts a line break.

**Auto-rename** is a session action in the application command palette, not a command in the focused Agent palette. It is offered when a session is open.

## File tree and text editor

| Shortcut | What it does |
| --- | --- |
| `Enter` on a focused file in the tree | Open that file. |
| `Command+S` (macOS) or `Ctrl+S` (Windows/Linux) in an editable file | Save the file. |
| `Command+F` (macOS) or `Ctrl+F` (Windows/Linux) in the text editor | Open search for the current document. |

## Terminal

With a selection in the focused terminal, use `Command+C` on macOS or `Ctrl+Shift+C` on Windows/Linux to copy it. This is separate from `Ctrl+C`, which the terminal normally passes to the running program.

## Task and question forms

| Where focus is | Shortcut | What it does |
| --- | --- | --- |
| New to-do title | `Enter` | Move to the description. |
| New to-do title or description | `Command+Enter` or `Ctrl+Enter` | Create the to-do. |
| Agent question form | `Command+Enter` or `Ctrl+Enter` | Submit your answers. |
| Subagent task's steering input | `Command+Enter` or `Ctrl+Enter` | Send the steering message. |
