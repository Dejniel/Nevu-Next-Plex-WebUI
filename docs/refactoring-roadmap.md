# Frontend refactoring roadmap

Status: active

The feature-based migration is complete. This roadmap covers targeted
maintenance that lowers regression risk or makes planned product work easier.
It is not a second rewrite and should not drive file movement for its own sake.

## Priorities

### Current focus

- Reduce large composition components where it clarifies a workflow or supports
  planned product work.

### Later

- Improve request-specific Plex types and gradually retire the global `Plex`
  namespace.
- Revisit match state management when matching gains more criteria, providers,
  or support for additional media types.

## Working approach

- Use the conventions in [`architecture.md`](architecture.md) as a starting
  point; adapt ownership when the resulting design is clearer.
- Prefer transport in `api`, pure decisions and transitions in `model`, and UI
  coordination in `ui`.
- Prefer one clear owner over generic abstractions shared by unrelated flows.
- Add focused tests for pure logic and request contracts; do not refactor solely
  to make component rendering tests possible.
- Remove replaced implementations once their callers have migrated.

## Recommended next steps

### Browse cache ownership and Plex synchronization — complete

Library, collection and playlist queries now cache actual responses; a shared
revision coordinates atomic window publication and preserves arbitrary jumps.
Watchlist uses native Query reads/mutations without its Zustand mirror. Plex
events and confirmed mutations share selective updates, with conservative
recovery for unknown dependencies. Decisions and completion checks are in the
[browse cache and Plex synchronization plan](browse-cache-and-plex-sync-plan.md).
All three stages are complete; removed mechanisms, final costs and verification
are in the [stage 3 results](browse-sync-stage3.md).

### 1. Lazy media metadata resource — complete

`features/media-actions/model/useLazyMediaMetadata` owns the card-local cache,
request status, concurrent request sharing, and stale-response protection.
The card uses `data`, `status`, `load`, `invalidate`, and `update`; Match and
Unmatch invalidate the resource, while editing updates it locally. Focused tests
cover request reuse, retry, invalidation, item changes, and local edits.

### 2. Media action capabilities and watched state — complete

`features/media-actions/model/mediaActionCapabilities` decides availability for
Edit, Match, Unmatch, Download, View Similar, and watched-state actions. Cards
and title details use the same decisions. `entities/media` owns watched-state
recognition and immutable updates, shared by cards, details, and episode rows.
Tests cover media types, remote sources, management and download permissions,
empty shows, and watched/unwatched transitions.

### 3. Isolate matching state when the workflow expands

The current dialog is acceptable for title, year, and language matching. Before
adding identifier searches, provider selection, or episode matching:

- move criteria, results, selection, loading, errors, and request generations
  into a `useMetadataMatch` controller;
- keep candidate normalization and request construction in the existing model
  and API modules;
- leave the dialog responsible only for rendering and user events.

### 4. Reduce title-details composition

`TitleDetailsScreen` remains the largest composition surface. Tab routing and
episode actions are useful candidates for clearer ownership, independently or
alongside product changes. Splitting static markup just to reduce the line count
offers little benefit.

### 5. Improve Plex contracts gradually

Replace global `Plex` types with imported request and view models one endpoint
family at a time. Start where a product change already requires understanding a
response shape; avoid a repository-wide type-only rewrite.

### 6. Make Plex notification updates more selective — complete

Delivered with the browse cache workstream above. Known stable changes patch
compatible cached occurrences; membership/dependency changes stage scoped windows.
Backend random catalogs share those decisions. Unknown predicates and missed
notifications still require recovery, with measured scan and request limits.

## Verification

Choose checks for the affected behavior using [testing.md](testing.md). Record
the results and any unverified scenarios; access to a particular server or
container is not a prerequisite for every refactor.
