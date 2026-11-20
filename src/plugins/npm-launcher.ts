/** Node runs pnpm as a separate process, with its package-relative CLI resources on disk. */
export const npmLauncher = { package: "pnpm", entry: "bin/pnpm.cjs" } as const;
