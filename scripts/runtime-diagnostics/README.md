# Local task-runtime diagnostics

The collector attaches to the task runtime's Node Inspector and saves memory/process time series and sampled allocation profiles. It does not start Electron, drive the GUI, inject business hooks, force GC, or upload data. Node 22.13 or later is required; the npm entry enables TypeScript stripping explicitly for older supported Node versions.

## Start a capture

From the repository root, start the development application in one terminal:

```sh
npm run dev:diagnostics
```

This starts the usual development application and adds `--inspect-runtime=9230`. Only the task utility process listens, on `127.0.0.1:9230`. Normal `npm run dev` does not enable this entry, and packaged applications ignore the development flag. Close an existing development instance before starting this diagnostic launch; single-instance behavior does not retrofit an inspector into an already-running task process. The development application uses its separate development data root, not the installed application's data.

After the runtime is ready, run the collector in another terminal:

```sh
npm run diagnose:runtime
```

Keep the collector running while using the application normally. It creates a unique capture directory under `.local/runtime-diagnostics/` and prints its path. No browser or DevTools attachment is required during recording. Avoid a second allocation profiler on the same target while the collector is sampling.

The default memory interval is five seconds. Allocation sampling uses an average 128 KiB interval and is checkpointed after the first memory sample and then every two minutes. Operations are sequential; a slow request, snapshot, or profile export delays the next sample. The collector records read duration, so long waits and missing intervals are visible rather than synthesized.

Custom collection settings:

```sh
npm run diagnose:runtime -- --interval 10 --profile-interval 300 --output .local/oom-investigation
```

To use another port, pass the runtime flag through electron-vite and select the same port in the collector:

```sh
npm run dev -- -- --inspect-runtime=9241
npm run diagnose:runtime -- --port 9241
```

Only explicit TCP ports are accepted; the runtime binding stays on IPv4 loopback. The inspector is a debugger with code-execution access, not an authentication boundary.

## Commands and stopping

Enter a command in the collector terminal and press Enter:

- `snapshot`: request a complete V8 heap snapshot after the current operation. Snapshot chunks stream directly to disk. This pauses the target and may require substantial extra memory; request a baseline well before memory exhaustion. Repeated requests before processing coalesce into one capture.
- `profile`: request an allocation-profile checkpoint after the current operation. Repeated pending requests coalesce.
- `stop`: stop collection and disconnect. Ctrl+C or SIGTERM also stops it.

The runtime keeps running when the collector stops. Inspector disconnect or a collection failure ends the capture with an error; it does not retry or reconnect. Previously saved files remain. Stopping does not wait for an additional final profile or a blocked target operation; the last completed checkpoint is the latest saved allocation profile. Interrupting a snapshot can leave a `.partial` file, and target-side snapshot work may still take time to finish.

## Read the artifacts

Each capture contains:

- `session.json`: target PID, Node/V8/Electron versions when supplied by the target, platform/architecture, and collection settings.
- `memory.ndjson`: one completed sample per line, including V8 heap usage, Node memory counters (RSS, heap used/total, external, and ArrayBuffers), cumulative CPU time, uptime, read duration, and derived CPU percentage. Node process counters are read through Inspector, not an independent operating-system monitor; a stalled target can delay them. CPU percentage is relative to one logical core and may exceed 100%.
- `memory.trace.json`: memory and CPU counter curves in Chrome Trace Event JSON format. Open the completed file in Perfetto UI to inspect the timeline. This is the collector's counter export, not Electron 45's protobuf `contentTracing` output. Trace time is relative to the start of sampling.
- `profile-*.heapprofile`: standard V8 sampled allocation profiles. Load these in DevTools' Memory panel. Checkpoints describe the ongoing sampling session's live sampled allocations, not all allocations ever made and not complete object-retention graphs.
- `snapshot-*.heapsnapshot`: explicit complete heap snapshots for DevTools' Memory panel and comparison/retainer analysis.
- `events.ndjson`: connection, profile/snapshot, failure, and capture-end events with timestamps.

A profile or snapshot receives its standard filename only after completion. Interrupted writes remain `.partial`. When the target disconnects or the collector stops normally, the counter trace is finalized. If the collector itself is forcibly killed, the trace can be incomplete; completed NDJSON lines and previously saved profiles remain usable. Files are written as collection proceeds, but there is no power-loss durability guarantee.

Capture directories and files use restrictive creation permissions where supported by the operating system. Keep captures outside source control; `.local/` is ignored. Snapshots can contain conversations, tool output, credentials, and other live data. Allocation profiles can contain local paths and function names. Review artifacts before sharing, including before opening them with an external analysis service.

## First OOM investigation

1. Start a fresh capture after application warm-up and request a baseline snapshot.
2. Run a fixed batch of representative requests and let them finish. Request another snapshot.
3. Repeat the same batch and request a third snapshot. Compare successive retained sizes and retaining paths, not just total allocation volume.
4. Separate idle use, conversation growth, session switching/sleep, and large tool output into distinct runs when narrowing the cause.

Sampling and snapshots introduce overhead and can change memory pressure. A growing RSS alone does not establish a JS leak; compare the heap trend and natural-GC low-water marks with allocation stacks and snapshot retainers. This recorder does not include a full CPU profile or a GC-event trace. Use a separate targeted trace if those are needed.
