# Browse cache and selective Plex synchronization

Status: all three stages complete. Recorded on 2026-10-05.

Contracts, observed events, baseline costs, and verification are recorded in the
[stage 1 results](browse-sync-stage1.md). Delivered library ownership and selective
runtime updates are recorded in the [stage 2 results](browse-sync-stage2.md).
List/Watchlist migration, removed mechanisms and final costs are recorded in the
[stage 3 results](browse-sync-stage3.md). Remaining metadata/directory reads were
completed in the [follow-up](browse-cache-followup.md).

This document records the direction, behavior to preserve, implementation plan,
and remaining questions. Cache ownership and selective synchronization are one
workstream: synchronization rules inform the cache design before its consumers
are migrated. See the [refactoring roadmap](refactoring-roadmap.md) for other work.

## Goal and starting assessment

Use TanStack Query to replace our general request/cache machinery, retaining
explicit Plex ordering and virtual-window rules. Reduce overlapping ownership
and unnecessary requests without losing library jumps or list behavior.

The starting point is commit `e09d493`: 1,164 additions and 1,005 deletions,
net +159 lines. Application code decreased by 97 lines; tests increased by 210,
and documentation/package files by 46. These counts do not establish architectural
simplicity. Useful changes to retain include request sharing, transport cancellation,
session cleanup, and tests for stale responses and catalog generations.

At the starting commit, these problems remained:

- `PagedCollection` maintains items, request statuses, errors, and consumer counts
  around Query. Page query functions return `null` and manually update a separate
  aggregate snapshot instead of returning the fetched page.
- `LibraryRangeStore` retains the old imperative interface over that controller.
- Watchlist mirrors Query data and status into Zustand through a `QueryObserver`.
- `RefreshScheduler` handles browser lifecycle and request coordination while
  Query's focus/reconnect refresh is disabled.
- Ordinary library notifications lost their item ID and change details in
  `serverChanges`; `useBrowseSynchronization` consequently invalidated the section,
  its collections, and all profile playlists.

The previous cache cleanup is therefore a starting point, not a completed
simplification. Preserve its useful behavior while removing the replaced layers.
Stages 2 and 3 remove these overlaps for the library, lists, Watchlist and availability.

## Technology and ownership

Keep React, Vite, MUI, TanStack Virtual, and TanStack Query. Use Zustand for
session/application/UI state, without mirroring server responses into it.
RTK Query would warrant reconsideration alongside a broader Redux migration;
SWR would still require the same Plex-specific coordination. No demonstrated
stack limitation currently justifies either migration.

| Responsibility | Owner |
| --- | --- |
| HTTP, response projection, cancellation/error conversion | Feature API and shared transport |
| Actual page/metadata/list responses, request state, sharing, freshness, eviction | TanStack Query |
| Grid geometry and visible/overscan indices | Existing virtual grid |
| Required offsets and assembly of the visible result | Feature hooks and pure transformations |
| Priority/concurrency limits, if needed | Small request limiter without its own cache |
| Pending versus published window, generation validation | Focused window coordinator |
| Notification parsing, affected-resource decisions, scan batching | Session parser and feature synchronization rules |
| Random catalog/order and their freshness | Existing backend library API |

Do not introduce a replacement general cache framework, normalized media database,
or registry of Query objects. Some coordination state is necessary; page data,
loading/error state, and observer counts must not acquire a second owner.
This work does not change playback, database persistence, or product navigation.

## Page identity and arbitrary jumps

Use `useQuery`/`useQueries` with independently addressable pages. The normal
virtual library is not a sequential `useInfiniteQuery` list. Query functions
return the actual endpoint response and pass Query's signal to HTTP.
See [dynamic parallel queries](https://tanstack.com/query/latest/docs/framework/react/guides/parallel-queries)
and the [infinite-query model](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries).

Page keys include the resource, server context, profile, canonical query, refresh
revision, offset, and page size. The canonical query includes source, item type,
filters, sort, and random seed where applicable. Server/profile identity must not
depend on tokens appearing in keys or Query object identity.

A local refresh revision separates a pending result from the published one;
the backend's `generationId` is separately validated when available. Neither is
a replacement for the other's meaning. Consumers of the same logical result
must share its revision and pages, rather than create independent cache copies.

With pages of 64 items, a jump to index 10,000 requests offset 9984, the next page
if needed, and bounded overscan. It does not fetch all earlier pages. The grid
uses the total count for scrollbar geometry and placeholders for missing items.
Keep unknown totals, empty results, partial last pages, and discovered end-of-list
behavior. Keep first-page bootstrap where count/catalog information is needed;
subsequent jumps must not restart sequential loading.

Visible pages take priority over overscan. Obsolete queued work is dropped;
cancellation must respect other consumers of the same page. Returning to a
cached range displays its available data under the chosen freshness policy.
Distinguish client HTTP cancellation from interrupting shared backend Plex work.
See [Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

## Synchronization decisions

Treat Plex notifications as hints, not complete metadata or a reliable changelog.
Preserve validated item/list/section IDs and available event type/state information.
Verify numeric event meanings against observed payloads before using them to
infer addition, deletion, or changed fields. Missing information remains unknown.

Use the following decisions for both external events and confirmed Nevu mutations:

| Known effect | Action |
| --- | --- |
| Item data changed; result membership and order are demonstrably stable | Fetch canonical metadata once and immutably replace cached occurrences |
| A field affects the result's filter, sort, or source membership | Mark that result stale and stage a replacement visible window |
| Item added/deleted | Update affected counts/results; offset positions may shift throughout the result |
| A specific collection/playlist changed | Refresh its contents and summary; update cached list listings where needed |
| Event lacks enough information, or notifications may have been missed | Revalidate the narrowest safe scope; broaden only as necessary |

Patch compatible response projections, not a single full-metadata shape into all
queries. Preserve playlist position and `playlistItemID`; update all occurrences
of a title without deduplicating repeated playlist entries. Include affected
cached metadata used by cards/details; changing the lazy-metadata interface is
justified only where needed to prevent stale data after edits or Match/Unmatch.

A metadata change is not automatically safe to patch. Watched state can affect
unwatched filters and Continue Watching; a title can affect sorting/search;
metadata updates can affect an `updatedAt` sort. Changes to an episode may affect
parent show/season aggregates. An item absent from loaded pages can enter a filter
or smart list. Do not use absence from cache as proof that a query is unaffected.

Keep dependency decisions conservative for arbitrary Plex filters/sorts. Do not
build a second client-side Plex filter engine. Narrow smart-list updates where
dependencies are known; use scoped revalidation when they are not. Local
availability changes must also reach affected Watchlist library filters.

Inactive affected queries become stale without being immediately downloaded.
An insertion/deletion must invalidate later cached offsets as well as the page
containing the item; refresh active windows and load other ranges when needed.
Query supports [targeted invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation);
feature rules decide the correct scope and whether a window refresh is required.

## Refresh, recovery, and races

For a refresh that can change positions, retain the published window, fetch a
new revision's required pages/count, validate them, then publish the replacement
as one window. Do not independently publish refetched pages in different orders.
If refresh fails, keep usable prior data and expose Retry. Never mark the old
window fresh merely because one page completed.

Use Query's browser lifecycle/freshness mechanisms where they fit. Ordinary
queries can use native focus/reconnect/interval refresh. Positional results must
route those triggers through window coordination; enabling independent automatic
page refresh would break the above guarantee. Remove the old scheduler once its
remaining duties are covered, retaining only needed event batching/coordination.

Coalesce duplicate IDs and scopes in event bursts. Replace the current 500 ms
grouping's repeated scan refreshes with bounded refresh frequency and a final
pending refresh. Continuous events must neither trigger one request per event
nor postpone updates indefinitely. Set the exact limits from request-count checks.
Avoid offscreen/tab-hidden background fan-out; reconcile on return/reconnect.

Confirmed mutations update or invalidate the same resource scopes as events.
A mutation completing during an older read must not be overwritten by that read.
A notification received during refresh must remain pending for reconciliation.
Session/profile/filter changes detach old results and prevent stale callbacks
from publishing into the current view. Preserve data sharing between consumers.

Do not assume the local server stream includes cloud Watchlist changes. Keep
cloud read-after-write/freshness recovery separately from local availability.
No new manual Refresh button is part of this plan.

## Random catalogs and consistency limits

The backend currently caches a projected catalog and seeded order. Its
`generationId` hashes membership IDs, not every metadata field; equal generations
do not prove fresh titles, posters, or watched state. Ordinary non-random pages
have no backend generation ID.

Keep random order stable for the same membership and seed. Update canonical
metadata in affected backend catalog/order entries for proven non-structural
changes, using the authorized scope; frontend patching alone would leave later
page reads stale. Rebuild affected catalogs for membership/filter changes or
uncertain recovery, batching scan work. Routine focus checks must not force a
full rebuild of a known-fresh catalog. Rebuilds still may require reading the
whole matching catalog on the backend; selective frontend paging does not remove
that cost. Retain bounded backend cache lifetime and memory use.

Reject mixed random generations. Atomic UI publication guarantees one prepared
window is shown together, not a transactional Plex snapshot. Ordinary offset
reads can observe library changes between calls; count/duplicate validation
cannot detect every missing item. Stronger guarantees would require a different
server snapshot contract, which is not promised by this refactor.

## Implementation sequence

### 1. Change contract and decision rules — complete

- Preserve validated event details; add sanitized real-payload fixtures where
  available and retain an explicit unknown case.
- Define resource/query identity and pure decisions for item patches, structural
  refresh, list dependencies, and recovery. Include confirmed local mutations.
- Record baseline request counts and separate frontend page requests, single-item
  reads, and backend catalog rebuild/Plex pagination costs.
- Verify representative event meanings and map backend random-cache dependencies.
  Do not first implement a second full synchronization system on the old cache.

Done when representative/unknown events produce justified scopes, structural
changes cannot be mistaken for safe patches, and the library migration has a
concrete query/revision contract. No broad stack migration is required.

### 2. Library cache and selective synchronization together — complete

- Return real page responses from Query; connect visible ranges directly to page
  queries and keep only necessary priority/window coordination.
- Implement stable item updates and staged structural refresh using step 1's
  decisions, including backend random-catalog freshness and recovery.
- Migrate grid and shelf consumers; remove the replaced library facade and its
  manual request state. Verify jump/race/request-count scenarios before expanding.

Done when arbitrary jumps and simultaneous consumers work, old revisions cannot
overwrite new ones, safe metadata updates avoid structural refresh, and structural
updates preserve scroll/filters without mixing page positions. Reassess the design
if this requires another controller comparable to `PagedCollection`.

### 3. Lists, Watchlist, availability, and removal of old mechanisms — complete

- Migrate collection/playlist pages and summaries, preserving repeated positions,
  playback context, targeted list changes, and conservative smart-list recovery.
- Use Query directly for Watchlist reads/mutations; remove the Zustand mirror and
  preserve mutation/read races, profile isolation, and cloud freshness recovery.
- Narrow availability updates where affected dependencies are known.
- Remove `PagedCollection`, obsolete adapters/buses, and replaced scheduler duties
  after their callers migrate. Keep only justified domain coordination; do not
  retain compatibility wrappers as the final architecture.
- Update architecture/roadmap/history to reflect the delivered ownership.

Done when migrated flows share the same ownership rules, superseded code is gone,
and the combined behavior and request costs have been verified.

## Verification and completion criteria

Use the [testing guide](testing.md). Automated checks cover pure decisions,
endpoint projection, paging, cancellation, and races; production build/type/lint
checks cover implementation changes. Real Plex checks complement mocks and record
unsupported/unavailable scenarios. Manual UI review comes at the completed stage,
not after every intermediate edit. Test containers retain `restart: "no"`.

| Scenario | Required evidence |
| --- | --- |
| Far jump, quick return, rapid scrolling | Only required/overscan pages load; concurrency stays bounded; cached return works |
| Two consumers, last consumer leaving | One shared request; one consumer cannot cancel another's work; inactive data expires |
| Safe item update and unrelated library | One canonical item read per batch; no unrelated window refresh or catalog rebuild |
| Filter/sort/watched/parent effects; insertion/deletion | Correct affected windows/counts; inactive offsets stale; no page-by-page publication |
| Random generation changes and refresh failure | No mixed generations; prior usable window and Retry retained |
| Long scan and event during refresh | Bounded requests/rebuilds, no lost pending refresh, final reconciliation |
| List edit, repeated playlist title, smart dependency | Correct contents/summary/playback positions; unrelated known-independent lists untouched |
| Watchlist mutation racing with read | Confirmed membership persists; cloud data and local availability remain distinct |
| Profile/filter change, reconnect, hidden-tab return | No stale publication or cross-profile data; missed events reconciled |

Review the final dependency graph and ownership, not just passing tests or total
lines. Report application/test line changes separately, removed mechanisms,
remaining custom coordination, bundle impact, and request-count comparisons.
Existing assertions should protect behavior rather than require the old classes.

Before implementation decisions are treated as established facts, resolve real
event semantics, available smart-list dependencies, revision sharing between
consumers, and scan/freshness limits. If Plex does not expose enough information,
document and test the scoped fallback rather than invent precision.
