/** Packages whose renderer instances carry React context or global state; plugins resolve them to the host's copies. */
export const rendererSharedModules: readonly string[] = [
  "react", "react/jsx-runtime", "react-dom", "react-dom/client", "react-intl", "zod",
  "@asterism-app/sdk/contracts", "@asterism-app/sdk/renderer", "sonner", "motion/react",
];
/** Every public subpath of the shared UI package is a host instance, so Radix providers and tokens stay single. */
export const sharedUiPackage = "@asterism-app/ui";
export const isRendererShared = (id: string) => rendererSharedModules.includes(id) || id.startsWith(`${sharedUiPackage}/`);
