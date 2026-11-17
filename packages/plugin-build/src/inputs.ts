/** The .test. filename marker is reserved for test sources in executable build graphs. */
export function isTestFile(id: string): boolean {
  return /\.test\.[^/]+$/u.test(id.replaceAll("\\", "/").split("?")[0]!);
}
export function assertRuntimeModules(modules: Iterable<string>): void {
  for (const id of modules) {
    const path = id.replaceAll("\\", "/").split("?")[0]!;
    if (isTestFile(path) || /(?:^|\/)node_modules\/(?:vitest|@vitest)(?:\/|$)/u.test(path)
      || path === "vitest" || path.startsWith("vitest/") || path.startsWith("@vitest/"))
      throw new Error(`Runtime entry imports a test module: ${id}`);
  }
}
