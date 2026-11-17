/** The .test. filename marker is shared by discovery, packaging, and both explicit build graphs. */
export const testFileGlob = "**/*.test.*";
export const testSourceGlob = "**/*.test.{ts,tsx,js,jsx,mts,cts,mjs,cjs}";
export { isTestFile, assertRuntimeModules } from "@asterism-app/plugin-build/artifact";
