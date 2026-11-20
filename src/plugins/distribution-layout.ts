/** Source and installed locations of the desktop's own manual topics. */
export const applicationManualLayout = [
  { path: "app", from: "docs/manual", to: "docs/manual" },
  { path: "plugin-build", from: "packages/plugin-build/docs", to: "packages/plugin-build/docs" },
  ...["docs", "examples"].map(path => ({
    path: `sdk/${path}`, from: `packages/sdk/${path}`, to: `node_modules/@asterism-app/sdk/${path}`,
  })),
];
