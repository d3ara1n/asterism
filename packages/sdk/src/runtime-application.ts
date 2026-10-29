/** One directory exposed under a distinct relative path in the manual catalog. */
export interface ManualSource {
  readonly path: string;
  readonly directory: string;
}
export interface ManualCatalog { sources(): readonly ManualSource[] }
export interface ApplicationIdentity { readonly name: string; readonly userAgent: string }
