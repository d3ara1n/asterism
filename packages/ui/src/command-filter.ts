import { defaultFilter } from "cmdk";

/** Keep cmdk's fuzzy ranking while excluding internal command identities from search. */
export function filterCommandLabels(_value: string, search: string, keywords: string[] = []): number {
  return defaultFilter(keywords.join(" "), search);
}
