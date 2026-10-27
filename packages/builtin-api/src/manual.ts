/** One directory exposed under a distinct relative path in the manual; files remain at their original location. */
export interface ManualSource {
  readonly path: string;
  readonly directory: string;
}
