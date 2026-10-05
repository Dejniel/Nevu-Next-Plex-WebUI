# Browse synchronization: stage 1 results

Status: complete on 2026-10-05. Cache migration and selective runtime updates
remain stages 2 and 3 of the [implementation plan](browse-cache-and-plex-sync-plan.md).

## Delivered contract

`session/model/serverChanges` preserves validated item/section IDs, provider,
numeric type/state, timestamp, and short metadata/media processing states.
Malformed neighbors no longer discard valid entries. Recovery keeps its cause:
preference changes, provider changes, or reconnect. Event payloads never become
cached media objects.

`entities/media/model/mediaChanges` defines server/profile-scoped item, list, and
recovery effects. The library and media-list policies return `ignore`, `patch`,
or `refresh`; they do not make requests or store data. Confirmed Nevu mutations
use this same contract when connected in the following stages.

`metadata` evidence requires verified before/after differences in canonical Plex
field names, including side effects such as `updatedAt`. A submitted `sortTitle`
must not be confused with the response field `titleSort`. An after-only read,
incomplete prior data, or a requested PUT field list is insufficient evidence;
use `unknown`. The current card projection omits several ordering/filter fields,
so stage 2 must provide needed comparison data or use scoped refresh.

Known filter/sort dependencies can select a patch; opaque predicates select a
refresh. The policy checks nested filter fields, not their truth values. An unseen
item can enter a result, so loaded membership is not used to prove independence.
Moves between sections remain structural even when only the new section is known.
Collection membership, parent changes, Continue Watching, and show aggregates
also receive conservative decisions.

Manual playlist positions can accept confirmed metadata patches. The current list
summary exposes `smart` but omits collection ordering and smart criteria; those
remain conservative refreshes. Playlist `libraryID` is navigation context, not a
membership restriction. Individual list events target their ID and relevant
listing; collection section scope and server/profile isolation remain explicit.

## Event evidence

Captured SSE on isolated Plex `1.43.4.10903-e5521bd8c` after changing/restoring a
synthetic sample's description and creating/deleting a temporary video playlist.
The description was restored and the temporary playlist removed. Test fixtures
replace section/item IDs and timestamps and contain no tokens, titles, paths,
accounts, or private server identity.

| Observed event | Preserved meaning | Synchronization evidence |
| --- | --- | --- |
| Movie type 1, state 3, metadataState `loading` | Metadata processing | Unknown item effect |
| Movie type 1, state 5 | Processing completed | Unknown item effect; no changed-field list |
| Playlist type 15, state 0, metadataState `created` | Playlist created | Specific list changed |
| Playlist type 15, state 9, metadataState `deleted` | Playlist deleted | Specific list changed |

The [Python PlexAPI alert documentation](https://python-plexapi.readthedocs.io/en/latest/modules/alert.html)
also identifies library states 0/9 as creation/deletion and states 1–5 as
processing. With an explicit library provider, 0/9 become structural hints;
unknown states and missing provider stay uncertain. Do not require state 5 to
finish every scan: agentless processing can end at state 1. Real collection,
episode/parent, smart-list, and agentless scan sequences were not captured here;
their unknown/fallback paths are covered automatically, without claiming live
validation. Playback progress and cloud Watchlist events are separate concerns.

## Library identity and revision contract

`libraryQuery` now owns query identity independently of `LibraryRangeStore`.
The current serialized key keeps runtime behavior unchanged until migration.
The replacement helpers define:

```text
result: ["library", serverId, profileKey,
         {sectionId, source, type, sort, normalized filterExpression, seed}]
page:   [...result, "page", revision, offset, size]
```

Use the actual PMS machine identifier, not a token or a random UI session ID;
wait for server identity before creating scoped queries. Equivalent filters ignore
labels, ordering, and duplicates. A shared local revision identifies a pending
or published result window; advance it for structural replacement, not a safe
item patch. Validate the response's backend `generationId` separately. Execution
must also check the current auth/session lifetime before publishing; matching
business keys alone do not protect a logout/relogin race. Revision coordination
and removal of the old key/store occur in stage 2.

## Baseline request costs

Measured against the existing cache before selective updates. Browser checks used
the isolated server; model/router checks used controlled data and clocks. Counts
exclude artwork, authentication, configuration, and cloud reads.

| Scenario | Measurement | Existing cost |
| --- | --- | --- |
| Description change in the open small library | Live browser/SSE | 1 library-page read, 0 individual metadata reads; restoring the description caused another page read |
| Initial range, jump to item 10,000, return | Model, 20,000 items, size 64, no overscan | 2 total page reads: offsets 0 and 9984; cached return adds 0 |
| Random window refresh at offset 9984 | Model | 2 page reads: offset 0 with `refresh=true`, then 9984 without the flag |
| Sustained 80 hints, one every 100 ms for 8 seconds | Scheduler, visible tab, immediate completions | 16 refresh callbacks with the current 500 ms grouping |
| Build a 1,300-item random catalog | Router with counted Plex transport | 3 upstream reads of up to 500 items |
| Read another page from that cached catalog | Same router/catalog | 0 additional upstream reads |
| Force-refresh the same catalog | Same router/catalog | 3 additional upstream reads even with unchanged membership |

The scheduler number is a controlled frequency baseline, not a live long-scan
measurement. The random-router counts separate upstream Plex work from frontend
page requests. The backend scopes catalogs by token hash, section, type, and
normalized filters; orders also depend on membership generation and seed.
Catalog TTL is 30 minutes, with limits of 8 catalogs and 16 orders. A metadata-only
rebuild keeps the membership generation but still rereads the catalog. Stage 2
must update affected card copies without invalidating seeded order unnecessarily,
and handle structural rebuilds/recovery in the authorized scope.

## Verification and next boundary

All 471 frontend tests in 99 files, typecheck, lint, and production build passed.
The backend built and its router was measured with synthetic transport. The live
browser reported no page errors; isolated containers retain `restart: "no"`.
Real payload fixtures and decision tests cover unknown events, structural versus
metadata effects, scope isolation, parent/filter effects, and query identity.

Net application change: +229 lines; tests/fixtures: +390 lines. This adds the
parser evidence, decision rules, and page-key contract; it adds no cache manager,
request registry, or production metrics subsystem. Obsolete cache ownership is
removed during stages 2/3. The production main bundle is 425.43 kB gzip versus
425.20 kB before this stage.

Stage 1 does not activate selective item fetching/patching or change backend
catalog behavior. The existing broad invalidation still runs. Stage 2 connects
these rules directly to real Query page responses and window coordination,
using the above costs to check improvement rather than building synchronization
twice around the old cache.
