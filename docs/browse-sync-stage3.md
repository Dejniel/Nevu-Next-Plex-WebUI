# Lists, Watchlist and final cache cleanup

Completed on 2026-10-05; finishes the three-stage
[implementation plan](browse-cache-and-plex-sync-plan.md).

## Ownership and behavior

Collection/playlist query functions return actual pages, with summaries included
in page zero. Native observers share requests and independently addressable
offsets. Playlist navigation library context does not create a separate resource.
Changing a list resets range demand; unknown totals can be resolved by a later
partial page; its cached end remains known after returning to the first range.
Repeated titles retain separate positions and `playlistItemID`.

`shared/lib/queryWindow` now serves both library and list pages. It stores only
the published revision, prepares the union of observed offsets and validates
counts/IDs before switching windows. Failed preparation retains prior data and
Retry. Query owns payloads, status, cancellation, observer counts and eviction;
the two-slot page limiter owns only transport scheduling.

`app/browseSynchronization` batches typed server/local effects once for all browse
resources. One canonical read can update the library, all cached manual-playlist
occurrences, details and GUID availability. Exact list changes refresh their
contents/summary and relevant listings. Smart/collection predicates remain opaque,
so uncertain effects use scoped window recovery. Scan limits remain 750 ms
grouping, at most one batch per five seconds and 256 pending scopes.

Watchlist uses `useQuery`/`useMutation` directly, including shared pending state.
Successful writes patch the published array; failed writes leave it intact.
Native cancellation prevents older reads from restoring confirmed membership.
Cancelled reads' unrelated cloud changes are recovered by subsequent freshness
checks; there is no custom merge ledger. Session revision/profile guards prevent
old writes or reads from publishing into a new session.

Availability caches plain local metadata arrays by server/profile/requested GUIDs;
consumers derive their indexes. Known GUID/copy changes patch affected arrays and
preserve other editions. Missing metadata, parent dependencies and uncertain
events require revalidation. The local stream does not invalidate cloud Watchlist.
Native focus/reconnect/stale mount and one-minute visible intervals provide
freshness without a manual Refresh button.

Removed: `PagedCollection`, `RequestQueue`, `loadPageWindow`, `RefreshScheduler`,
`useAutoRefresh`, `libraryCache`, list-change refresh bus and Watchlist Zustand
mirror. No replacement resource registry or compatibility adapter was added.
Card-local lazy metadata remains on-demand and responds to domain invalidation.

## Verification and costs

| Scenario | Result |
| --- | --- |
| Canonical change shared by library/list/details/availability | 1 item read; 0 window refreshes |
| Live Plex description edit and restoration in an open playlist/details | 1 canonical read each; 0 list page/summary reads |
| Live Plex playlist rename | 1 contents read and 1 summary read; heading/count update |
| Controlled library jump to 10,000 and return | Offsets 0 and 9984; return adds no read |
| Sort change after that library jump | Scroll returns to zero; only new page zero loads |
| Controlled playlist jump to 10,000 and return | Offsets 0, 10000 and 9900 (overscan); cached return; playback entry ID/position preserved |
| Watchlist screen, filter and membership controls | 1 shared cloud read; confirmed removal updates the view |
| Eight-second scan | Still 3 grouped window refreshes, including trailing reconciliation |

Browser checks use Chromium and the final local Docker image. Real Plex checks
cover list loading, collection loading, metadata changes and playlist rename;
temporary lists are deleted and the description restored. This Plex deduplicates
a repeated append, so repeated-entry behavior uses controlled pages. Large grids
and cloud Watchlist responses/writes are also controlled; no cloud account data
is changed. Browser checks report no page errors. Playback links/positions are
verified, while actual media playback is unavailable in this test environment.

Automated checks cover simultaneous consumers, request limits, cancellation,
profile changes, random generations, atomic refresh failure/retry, smart fallback,
repeat IDs, out-of-order writes, cold reads, parent effects and failed recovery.
Validation: 467 frontend tests in 98 files, 48 backend tests, frontend type/lint/build,
backend lint/build and Docker build pass. Both containers retain `restart: "no"`.

Against stage 2: application +830/-1,290 lines (net **-460**), tests +1,072/-985
(net +87), excluding docs. Stages 2 and 3 together: application net **-69** and
tests net +164 against stage 1. Main JS is 428.61 kB gzip versus stage 2's 429.64
kB (-1.03 kB); the existing large-chunk advisory remains. No dependency was added.

Atomic publication is not a transactional Plex snapshot. Concurrent offset reads
can still miss changes that preserve observed counts/IDs; unknown predicates and
missed notifications retain recovery. Existing backend random catalogs can still
require full Plex pagination on structural rebuild.
