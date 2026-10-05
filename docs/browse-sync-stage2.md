# Library Query migration and selective synchronization

Completed on 2026-10-05. Stage 3 covers lists, Watchlist and availability.

## Ownership

Library pages now contain real `LibraryPageDto` responses in TanStack Query.
Keys include server, profile, canonical query, revision and offset. Grid, toolbar
and shelf consumers share pages and revisions. `LibraryRangeStore`, its serialized
keys and the library-only branches of `PagedCollection` are removed.

`libraryPages` coordinates positional consistency: its window query prepares
page zero and the union of offsets observed by current consumers, validates
counts, duplicate IDs and random generations, then publishes a new revision.
It stores only the revision; responses and request/error state remain in page
queries. Failed refreshes preserve the prior window and expose Retry. Old reads
are cancelled before applying confirmed changes. Query owns observer lifetimes
and eviction; there is no resource registry or manual consumer count.

A changed filter/sort/seed resets the grid and visible-range demand. Refreshes of
the same result retain its scroll position; reset scrolling is immediate to avoid
fetching intermediate ranges of a new result.

`useLibraryPages` derives the displayed indices from observed pages. The small
abort-aware transport limiter allows two requests and prioritizes visible pages
over overscan. Query's window lifecycle handles stale mount/focus/reconnect and
one-minute visible refresh checks. Pages do not independently refetch positions.

## Synchronization

External Plex hints and confirmed local edits/Match/Unmatch/watched actions use
the same server/profile-scoped effect contract. A canonical item read compares
the card projection before and after, including Plex side effects. Supported
sort/filter dependencies are shared between frontend and backend. Unknown
dependencies, missing prior items, membership changes and parent effects require
scoped refresh; absence from loaded pages never proves independence.

Safe changes replace cached occurrences, including inactive pages. Structural
changes invalidate the result descriptor and prepare a replacement active window;
later offsets load in its new revision. Backend random catalogs and seeded order
entries receive safe canonical patches too. Structural/filter changes evict the
affected authorized catalogs through explicit invalidation; the old page-request
`refresh` flag is removed. Invalidated in-flight rebuilds cannot resurrect
their catalog or order cache. Routine focus checks reuse a fresh random catalog.

Full title metadata also uses Query. When that representation is cached, the
same synchronization read requests full details and updates it, cancelling older
reads. This avoids a separate details refresh for each event. Parent metadata
queries are invalidated when child aggregates can change. Lazy card metadata is
invalidated by item/recovery effects and still loads on demand.

Hints are grouped for 750 ms, duplicate IDs are coalesced, and batches start at
most once every five seconds. Each affected result and random-catalog scope
refreshes once per batch. Events arriving during work remain pending for a
trailing reconciliation. Hidden tabs defer this work until return. More than
256 pending scopes become a recovery hint; failed recovery remains pending.

## Evidence and costs

| Scenario | Stage 1 baseline | Stage 2 |
| --- | --- | --- |
| Description edit in a real Plex library | 1 page read, no canonical item read | 1 canonical item read, no page read |
| Restore that description | Another page read | Another canonical item read, no page read |
| Jump to item 10,000 and return | Model: pages 0 and 9984; return adds none | Model and browser grid: same two reads, cached return |
| Eight-second scan: 80 hints at 100 ms | 16 scheduler refreshes | 3 window refreshes and 3 catalog invalidations, including trailing work |
| Metadata-only change in a 1300-item random catalog | Forced rebuild reads 3 Plex pages | 1 canonical item read; 0 catalog-page reads; seed and generation preserved |
| Subsequent cached random page | 0 Plex reads | 0 Plex reads, updated metadata present |

Scan and large-catalog measurements use controlled tests, not a live large Plex
library. Chromium also verifies the actual grid with 20,000 controlled cards:
changing sort after a far jump resets scrolling and fetches only page zero.
Live verification uses the isolated local Plex: description changes update both
the library and an open details dialog, are restored, and publish no Plex
Community data. Both browser checks record no page errors. Counts distinguish
frontend page requests from upstream Plex reads. The initial random catalog still
requires full pagination; structural recovery can still rebuild it.

Behavioral tests cover shared requests and last-observer cancellation, arbitrary
jumps/cached returns, first-page errors, unknown totals, atomic failed/successful
refreshes, scrolling during preparation, mixed random generations, mutation/read
races, parent effects, scoped updates, batching and hidden/profile recovery.
Backend tests cover projections, dependent filters, an absent item entering a
result, token isolation, catalog races and optional full details.

Validation: 467 frontend tests across 101 files, 48 backend tests, both projects'
type/build/lint checks and the final Docker build pass. The main JS bundle is
429.64 kB gzip, up 4.21 kB from stage 1; the existing large-chunk advisory remains.

Against the stage 1 commit, application code is +1,005/-614 lines (net +391),
tests +640/-563 (net +77), excluding docs. This stage adds selective event
reconciliation, backend catalog updates and full-details sharing while removing
the library facade and its duplicate request state. The remaining shared list
controller prevents claiming a repository-wide reduction before stage 3.

Positional validation is not a transactional Plex snapshot. Ordinary offset
reads can miss concurrent changes that leave counts and sampled IDs consistent.
Unknown predicates therefore retain scoped revalidation. The existing list and
availability scheduler/buses and Watchlist Zustand mirror remain for stage 3;
the library no longer consumes them.
