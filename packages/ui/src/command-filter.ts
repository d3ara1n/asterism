import { defaultFilter } from "cmdk";

/** Keep cmdk's fuzzy ranking while excluding internal command identities from search. */
export function filterCommandLabels(_value: string, search: string, keywords: string[] = []): number {
  return defaultFilter(keywords.join(" "), search);
}

/** The same fuzzy match as a predicate, for collections that filter without ranking. */
export function matchesCommandText(text: string, search: string): boolean {
  const query = search.trim();
  return !query || defaultFilter(text, query) > 0;
}
