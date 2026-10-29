/** The `.test.` filename marker is reserved for test files across discovery, packaging, and compilation. */
export const testFileGlob = "**/*.test.*";
export const testSourceGlob = "**/*.test.{ts,tsx,js,jsx,mts,cts,mjs,cjs}";
export function isTestFile(id: string): boolean {
  return /\.test\.[^/]+$/u.test(id.replaceAll("\\", "/").split("?")[0]!);
}

/** Runtime entry graphs exclude test files and the Vitest runner, regardless of how they were imported. */
export function assertRuntimeModules(modules: Iterable<string>): void {
  for (const id of modules) {
    const path = id.replaceAll("\\", "/").split("?")[0]!;
    if (isTestFile(path)
      || /(?:^|\/)node_modules\/(?:vitest|@vitest)(?:\/|$)/u.test(path)
      || path === "vitest" || path.startsWith("vitest/") || path.startsWith("@vitest/"))
      throw new Error(`Runtime entry imports a test module: ${id}`);
  }
}
