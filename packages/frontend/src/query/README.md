# TanStack Query integration

TanStack Query owns remote server state. Pinia continues to own client state and persisted preferences.

## Query keys

All keys are created by `queryKeys` and have this shape:

```text
['misskey', host, accountId | 'anonymous', 'endpoint', endpoint, params]
```

Explicit-token requests bypass the shared query cache. This prevents data returned for another account from being stored under the active account's key.

## Streaming

Streaming events update entity queries through `query/streaming.ts`. A stream-backed timeline remains owned by `Paginator` until its complete behavior can be represented without regressions.

## Paginator decision

Keep the existing `Paginator` for now. Replacing it wholesale with `useInfiniteQuery` has a negative cost/benefit ratio at the current boundary:

- There are 110 production `Paginator` constructions across 61 files.
- It supports newer and older cursor directions, date and ID cursors, offset mode, bounded item trimming, queued items, live stream insertion, ad markers, partial-result handling, and manual entity updates.
- `useInfiniteQuery` covers page caching and bidirectional page parameters, but the queue, trimming, live insertion, item mutation, and current `IPaginator` component contract would still require a substantial adapter.
- Migrating now would temporarily create two timeline cache authorities: TanStack pages and the existing stream-driven item list.

Reconsider migration when a tested adapter can preserve `IPaginator`, streaming updates can write directly to infinite-query pages, and at least the timeline and list component suites cover cursor direction, trimming, queue release, and reconnect behavior. Until then, use TanStack Query for entity/detail queries and bounded shared lists, and retain `Paginator` for stream-oriented collections.

The retained paginator uses shallow collection reactivity, linear cursor and duplicate detection, immutable single-notification array updates, and abortable/coalesced page requests. These optimizations keep its stream-oriented behavior without introducing a second infinite-list cache authority.
