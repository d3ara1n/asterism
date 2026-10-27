# Build a small plugin

A counter plugin demonstrates the complete path from shared declarations to backend behavior and a resource card. The SDK includes it as an ordinary package directory under `examples/counter`, with source files, a package manifest, and a TypeScript configuration. Its code is the maintained example; this guide explains how to use and adapt it.

## Prepare the package

Copy the counter directory to a writable development location. Point its `file:` SDK development dependency at a local SDK source package. The SDK is currently a private source package; its peer dependency describes a host-provided package, and the host does not use its version range to gate loading. React, React Intl, and Zod are also shared public dependencies supplied by the host when the plugin runs.

Run `npm install` and `npm run typecheck` in the copied directory. The host compiles the TypeScript, TSX, and imported CSS entries, so a separate JavaScript build is optional. Add the package directory in Asterism's plugin settings and restart the application to load it.

## Follow the data

Shared declarations identify the counter, its private current value, projected view, change record, creation entry, increment action, read tool, settings, and typed call. Backend and frontend code import the same declarations. Copying a declaration under the same name does not establish shared runtime identity.

Creation establishes the object. Incrementing reads the configured step, saves the current value, and appends a historical change in one synchronous commit. The example keeps the latest counter value when browsing history; it does not implement restoration. Network and file work belongs outside synchronous commits.

The card reads projected data and invokes the public increment action. Each button owns its pending state and displays failures. Actions return receipts that the view checks; typed calls and settings saves reject on failure. A settings page edits the step and reads it back through the backend call.

The model tool reads the same counter value through its resource implementation. Registering the tool does not grant access: an agent needs a link to the counter and a tool policy that allows the operation.

## Adapt the package

Choose a distinct plugin identity before using the example as a new plugin. Keep shared declarations independent of backend and frontend implementations. Add resource behavior through actions and expose an operation as a model tool when the model needs to call it.

Imported CSS Modules keep the counter's class names local. Host theme variables provide colors. The storage entry declares the managed configuration format; add consecutive migrations when that format changes. Credentials belong in the secret service, and retained file content uses the content service.

Object-owned external connections belong to the resource's attachment lifetime. Register their cleanup when opening them. Shared services belong to the plugin lifetime. Managed tasks own asynchronous work and pass cancellation to their I/O.

## Verify the result

Open the plugin settings page, change the step, and read it back. Create a counter, increment it, and verify the card and history. Link the counter to an agent and use its read tool.

After edits, run type checking and restart Asterism. Verify invalid input, failure messages, cleanup, and reopening saved objects. Type checking establishes interface consistency; loading and using the package establishes its behavior in the host.
