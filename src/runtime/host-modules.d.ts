declare module "virtual:asterism/runtime-host-modules" {
  /** File URLs of the backend host modules, keyed by module specifier. */
  const modules: Readonly<Record<string, string>>;
  export default modules;
}
