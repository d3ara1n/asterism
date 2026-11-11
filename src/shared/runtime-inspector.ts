/** Inspector ports are explicit TCP ports; the runtime always binds to IPv4 loopback. */
export function inspectorPort(value: string): number {
  if (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new Error("Inspector port must be an integer between 1 and 65535.");
  return Number(value);
}

/** Packaged applications do not expose the development runtime inspector entry. */
export function runtimeInspectorPort(args: readonly string[], isPackaged: boolean): number | undefined {
  if (isPackaged) return undefined;
  const flags = args.filter(arg => arg === "--inspect-runtime" || arg.startsWith("--inspect-runtime="));
  if (!flags.length) return undefined;
  if (flags.length !== 1 || flags[0] === "--inspect-runtime")
    throw new Error("Specify --inspect-runtime=<port> once to inspect the task runtime.");
  return inspectorPort(flags[0]!.slice("--inspect-runtime=".length));
}
