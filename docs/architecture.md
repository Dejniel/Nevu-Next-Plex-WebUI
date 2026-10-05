# Architecture

The frontend currently uses vertical feature modules. The conventions below
aim to make ownership clear and limit coupling; they can evolve when a change
benefits from a different structure.

## Layers

```text
src/
  app/                 application bootstrap, providers, routes, and theme
  entities/<entity>/   reusable domain data, model helpers, and UI
  features/<feature>/  feature-owned API, model, state, and UI
  shared/              domain-neutral transport, UI primitives, and utilities
```

The intended dependency direction is:

```text
app -> features -> entities -> shared
```

Runtime legacy modules have been removed. `plex/plex.d.ts` remains only as the
global Plex response contract while those types are migrated incrementally.
Prefer feature-owned runtime code over the former horizontal `components`,
`pages`, `states`, `common`, and `plex` directories.

Feature-to-feature integration normally uses public entry points. For example,
playback consumes the watch-together controller without knowing its Socket.IO
protocol or UI. Prefer narrow contracts over chains of feature internals.

## Feature boundaries

Each feature exposes its supported UI surface through `public.ts`. Code outside
a feature imports from that file instead of reaching into `api`, `model`, or
`ui`. A root `model.ts` may expose a deliberately headless contract when a
state-only consumer would otherwise load the feature's UI graph. A root
`routes.ts` can expose screens solely to `app`, keeping them out of contracts
used by other features. The current set
is encoded in `architectureBoundaries.test.ts`; session additionally provides
the current authenticated Plex request context across layers. Files inside the
same feature use direct relative imports so their ownership is visible and
barrel-file cycles are avoided.

Entities expose their supported UI through `public.ts` and may additionally
expose a headless `model.ts` entry point. API and model code should use the
headless entry point when importing `public.ts` would also load UI dependencies.
`entities/media` owns reusable media data helpers and cards shared by library,
title details, and playback.

The library module is the reference implementation:

```text
features/library/
  api/       Plex/backend requests and transport error mapping
  model/     filters, sorting, Query pages/window coordination, and transformations
  ui/        routed screen and library-specific components
  public.ts  exports used by the rest of the application
```

`features/title-details` follows the same boundary for title metadata, extra selection,
reviews, downloads, and the details dialog. `features/playback` owns stream
selection, timeline reporting, subtitle search, queue controls, and the routed
player screen. `features/watch-together` owns the cross-session connection,
protocol adapter, room dialog, waiting room, notifications, and player-facing
synchronization controller. `features/home` owns the routed discovery screen,
hero selection and presentation, and composition of home shelves while reusing
the public library, media, and title-details surfaces. `features/session` owns
Plex authentication, Plex Home selection, persisted credentials, the active
user, server-level identity, capabilities, and authenticated Plex request
context. `features/settings`, `features/search`,
`features/library-navigation`, and `features/watchlist` own their corresponding
workflows. `features/media-actions` owns reusable card actions, metadata
editing and matching, original-file downloads, and playback-target resolution
while the shared `MediaCard` remains presentation-focused. `entities/library`
owns reusable library data and administration requests.

`app/library/LibraryBrowse` composes the library view selector and its screens.
Watchlist, collection, and playlist views share `LibraryBrowseFrame`; all library
views reuse the card toolbar and `shared/ui/VirtualGrid`.
`features/media-lists` owns the collection/playlist API
adapters, mutations, profile-scoped paging, and the shared add-to-list dialog;
playlist positions remain distinct even when titles repeat. Its headless model
supplies playlist playback, return links, and list-action capabilities.
`entities/media` resolves accessible local copies by GUID; Watchlist retains its
account API and profile-scoped Query resource, separate from library paging.

`architectureBoundaries.test.ts` checks the current entry-point and dependency
conventions. Update those checks alongside intentional architecture changes.
It also checks runtime import cycles reachable from the browse features.
Headless entry points help non-UI consumers avoid UI dependencies or cycles.

One `serverQueryClient` owns browse responses, requests and eviction. Library,
collection and playlist consumers observe actual page queries and share a window
descriptor containing only the published revision. `shared/lib/queryWindow`
prepares and validates replacement pages before publication; a small transport
limiter bounds page work. Summaries publish with list pages, and repeated playlist
entries retain their positions and IDs. Canonical metadata is shared by cards,
previews, Home, details and playback selection. Sections, directories, recommendation
context, child lists, GUID resolution and Discover extras also use native queries.
Local state retains UI choices and action-lifetime guards, without server-data mirrors.

`app/browseSynchronization` batches scoped Plex hints and confirmed local changes.
Feature rules patch compatible occurrences or refresh affected windows; one
canonical read can supply library cards, lists, details and availability. Random
catalog freshness stays in the backend. Unknown collection/smart-list dependencies
retain scoped recovery. Session changes clear Query requests and data.

Watchlist reads and confirmed membership mutations use Query directly; local
availability caches plain metadata arrays, with GUID indexes derived by consumers.
Native stale mount/focus/reconnect and visible intervals replace the scheduler.
Cloud Watchlist freshness remains distinct from local server notifications.
The old paged controller, refresh buses and Zustand Watchlist mirror are removed.
See the [stage 3 results](browse-sync-stage3.md), [follow-up](browse-cache-followup.md) and the
[completed implementation plan](browse-cache-and-plex-sync-plan.md).

## Video playback

`shared/ui/VideoPlayer` owns one native `<video>` element and its lifecycle;
direct files use the browser and HLS/DASH use the lazily loaded npm Shaka Player.
`entities/media` probes browser codecs, builds Plex client profiles, negotiates
Direct Play/remux/audio or video conversion, and releases owned sessions.
Text subtitles use Plex WebVTT extraction; image/styled subtitles use burn-in.
Local extras, Discover trailers, card previews, and full playback share this
engine. Plex supplies conversions; Nevu has no separate transcoder.

## API and state conventions

- Plex transport and HTTP error conversion live in `shared/api/PlexClient.ts`;
  token and Plex session parameters are supplied by the headless session model.
- Feature API modules translate transport data into the feature contract.
- Keep queries and invalidation rules in their features; use global stores for
  session or application state.
- Keep pure parsing, normalization, and query-key functions in `model`, with
  focused tests where useful.
- Reuse feature API operations instead of duplicating requests in components.

## Making changes

Use existing ownership as a starting point, expose the needed contracts, and
remove superseded implementations once their callers have migrated. Choose the
scope that makes the resulting code clearer, including broader refactors when
useful. Prefer abstractions with concrete consumers over speculative layers.

See [testing.md](testing.md) for verification appropriate to the change and
available environment.

## Backend persistence

`backend/src/database.ts` uses `better-sqlite3` for one profile-scoped settings
table. Parameterized statements read and upsert options; initialization creates
the table if missing and shutdown closes the connection. Plex owns ratings and
reviews. Docker builds JavaScript on the builder's architecture and installs
native SQLite separately for the target image. Socket handlers receive their
server explicitly.
