# Deferred crawl capability

Filed: 2026-11-02
Status: Deferred until a second concrete consumer needs crawl semantics.

## Current scope

Web providers declare search and URL-fetch capabilities. The shared service filters the configured priority list by capability and, for URL retrieval, by URL patterns. Single-page scraping belongs to fetch: it retrieves readable content for a supplied URL.

Firecrawl's upstream crawl API alone does not justify a new shared operation. The current integration uses search and single-page scrape only.

## Revisit trigger

Revisit when a second concrete consumer needs multi-page traversal beyond the initial Firecrawl use case. Identify the actual consumers and their requirements before designing a shared contract.

## Questions to resolve then

- Traversal input: entry URL, scope, depth, page limits, and inclusion or exclusion rules.
- Execution model: remote job identity, progress, partial results, completion, and failure.
- Cancellation: stopping local HTTP work versus cancelling a remote job, including cancellation before a job ID is available.
- Capability declaration and ordered provider selection for the new operation.
- Result ownership, history, usage reporting, and any persistent state required by real consumers.

Schema-directed structured extraction is a separate potential operation. Do not fold it into crawl or ordinary URL retrieval without a concrete consumer and an approved contract.
