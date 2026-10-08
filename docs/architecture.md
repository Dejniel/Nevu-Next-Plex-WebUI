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

Library browsing shares one paged catalog for video, music and photos. The
contracts discriminate video, music and photo cards; the backend projects only
their browsing fields and normalizes Plex photo-album `Directory` records to
`photoalbum`. Native Plex descriptors supply types, filters and sorting.
`entities/library` determines available library views, while media presentation
selects artwork and captions by type. Video actions and previews stay restricted
to video. Parent synchronization includes artists, albums and photo albums;
all types retain the existing Query windows, virtualization and cached jumps.

Artist, album and photo-album pages use canonical metadata and the same paged
catalog with a `children` source and parent identity. History scroll positions
are UI state, kept separately from server data. `features/music` owns playback
identity and a profile-scoped Query resource for Plex's native queue; queue entry
IDs distinguish repeated songs. Its persistent controls reuse the shared
native/Shaka player, with original audio and one Plex conversion after a format
failure. Its source model owns cancellation, late responses and session cleanup.
Repeat uses the shared player's native loop or Plex's queue reset; queue mutations
share one cancellation owner and read a fresh bounded window after acknowledgement.
Song-end events wait for edits before advancing. Shuffle first reports the current
entry to Plex and preserves its playback source. A browser checkpoint scoped by
server/profile stores only selection IDs, position, repeat and volume. Restoration
validates the native queue and resumes paused; it does not persist queue contents
or credentials.
Plex's [native shuffle API](https://developer.plex.tv/pms/#tag/Play-Queue/operation/playQueueQueuePutItemsShuffle)
does not support queues with an Up Next area; a rejected change leaves playback
intact and suggests starting a shuffled album/playlist selection.
Audio conversions and video share `shared/api/plexPlayback`: decision validation,
identical preparation/start parameters and captured credentials for session control.
`features/photos` keeps preview identity in the URL and reads nearby catalog
pages in the current filter/sort order. Neither workflow adds a second catalog
cache. Video clips in photo albums use the existing video playback screen.
Root photo browsing retains Plex's mixed album/photo catalog; its presentation
type is separate from the photo-only search filter used by Plex.
The `All photos` view requests `type=13&clusterZoomLevel=1` for photos across
nested albums, initially sorted by date taken. Section and album browsing share
one URL/filter/sort model and the same controls; albums use native `children`
paging without a type restriction, retaining subalbums and video clips. These
contexts use existing Query identities and separate sort preferences.

`features/media-actions` owns the shared rating control, rating writes and personal
menus for music/photos. Menus lazily read canonical metadata to list every original
file, using the same permission model and download entries as video. Accepted
ratings update existing metadata and publish a `userRating` synchronization hint;
title details retain their review invalidation and optional review-writing action.
Menus reset with item/server/session changes and use the common fullscreen portal host.

The library module is the reference implementation:

```text
features/library/
  api/       Plex/backend requests and transport error mapping
  model/     filters, sorting, Query pages/window coordination, and transformations
  ui/        routed screen and library-specific components
  public.ts  exports used by the rest of the application
```

`features/title-details` follows the same boundary for title metadata, extra selection,
reviews, downloads, and the details dialog. Review entry points share one Plex
editor and a profile-scoped Query resource; confirmed saves update its readers.
`entities/media` owns the pure rating model and shared score display. Provider
values keep Plex's 0–10 scale; friend scores remain individual ratings. Library
cards carry score values and provider identifiers, without extra reads.
Personal title ratings come from the active server; community review ratings
remain attached to their Plex activity.
`features/playback` owns stream
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

Server and library preferences share the normalized `Setting` contract and
validation in `contracts/preferences`; `entities/plex-preferences` owns the field
renderer and sparse local drafts. Settings uses native profile/server-scoped
queries for server preferences, library administration and server folders. Drafts
retain edits across background reads without copying server responses. Writes
use captured credentials, reject obsolete sessions and revalidate affected
resources. The backend verifies the active account and PMS management permission,
excludes hidden values and validates edits against freshly read descriptors.
Server groups and field availability come from PMS; known effects and restart
requirements use a small explicit annotation map. Metadata editing keeps its
own value/lock model rather than treating metadata as preferences.

Plex Home membership and permissions come from Plex's Home API, using the active
profile's account token. Settings observes one native Query resource and revalidates
it after writes; safe profile fields update the session and profile picker. PINs
exist only in the open form/request, outside persistence and the mutation cache.
Home administration and server management are independent permissions. Home
library access and Sharing observe the same profile/server-scoped Query resource
and use one mutation model. Forms retain drafts across background refreshes;
successful writes revalidate before closing, with a final session check.
Managed-user name and restriction changes form one operation, with one pending
state and revalidation even after partial failure. Membership changes also
invalidate library access. PINs remain outside Query mutation variables.

`app/library/LibraryBrowse` composes the library view selector and its screens.
Watchlist, collection, and playlist views share `LibraryBrowseFrame`; all library
views reuse the card toolbar and `shared/ui/VirtualGrid`.
`features/media-lists` owns the collection/playlist API
adapters, mutations, profile-scoped paging, and the shared add-to-list dialog;
playlist positions remain distinct even when titles repeat. Its headless model
supplies playlist playback, return links, and list-action capabilities.
Video and audio playlists share paging, editing and synchronization; index keys
include their media type. Music uses native Plex playlist sources for its queue,
validating the selected saved entry before playback. Track rows are shared with
album browsing; playlist entries add their position and editing actions.
Playlist editing uses the active profile's token and Plex entry IDs. Reordering
reads only the source and destination entries, checking their current positions.
Native Query mutations reuse list synchronization before closing the editor;
deletion removes the matching detail cache and refreshes playlist listings.
Card menus accept additional items without owning playlist-editing rules.
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
limiter bounds page work. Pending refreshes follow Query's live observers,
cancelling obsolete queued/running pages while retaining shared demand.
First-page hooks supply grid counts; `useVirtualGrid` computes the current range
before page hooks read it in the same render. Cached jumps render available cards
immediately. Memoized actionable cards skip unchanged props during scrolling.
Summaries publish with list pages, and repeated playlist
entries retain their positions and IDs. Canonical metadata is shared by cards,
previews, Home, details and playback selection. Sections, directories, recommendation
context, child lists, GUID resolution and Discover extras also use native queries.
Local state retains UI choices and action-lifetime guards, without server-data mirrors.

`app/browseSynchronization` batches scoped Plex hints and confirmed local changes.
Feature rules patch compatible occurrences or refresh affected windows; one
canonical read can supply library cards, lists, details and availability. Random
catalog freshness stays in the backend. Unknown collection/smart-list dependencies
retain scoped recovery. Session changes clear Query requests and data.

Reconciliation captures prior relationships and verified metadata differences
before publication. Deletion and parent moves reach cached seasons/shows; missing
relationships trigger scoped recovery. Raw directories use known dependencies,
preserve container fields when patching, and revalidate opaque predicates.
Filter values select from the same directory queries as discovery. Full metadata
dependencies remain separate from fields provable by the smaller card projection.

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
`entities/media/model/mediaPlayback` describes segmented playback capabilities,
track and quality constraints, and interprets Plex's playback decision.
Plex media always negotiates HLS/DASH through `/decision`; preparation and start
share one session and identical parameters. At Original quality, supported tracks
are copied into segments; incompatible tracks and subtitle burn-in require
conversion. Quality presets request H264 conversion regardless of the source's
average bitrate; audio copying remains independent. Decisions must include an
active video track; conversion success codes alone are insufficient. Original
quality removes the bitrate limit while retaining segmented delivery. The Plex
source type excludes original files; its ID owns the streaming session. Discover
extras retain their independent resolver.
`useMediaPlaybackSource` owns cancellation, publication and session cleanup.
After a decoder/format failure it permits one different H264/AAC conversion,
also negotiated through `/decision`. Network retries belong to Shaka;
access denial, missing files and network failures never trigger conversion.
After a conversion refusal, explicit quality presets may offer Try Original if
the capability plan can copy video. This user action keeps the resume position,
uses segmented playback and leaves saved quality unchanged; the next item
restores it.
DASH targets use eight-second segments and `BreakNonKeyframes`, matching PMS's
fixed index. The API supplies source traits for separate initialization and seek
pre-roll. Shaka's response filter removes repeated MP4 initialization from media
fragments using its own parser; copied video reads preceding fragments when seeking.
Browsers without MSE negotiate HLS; Shaka chooses MSE or native playback.
Identified source events prevent old attempts from affecting a new item/profile;
each attempt releases its sessions and retains playback position and pause.
Text subtitles load after video readiness; Plex requires separate read
authorization for WebVTT extraction, which never gates the video's initial source.
Complete WebVTT is attached through owned blob URLs; pending native tracks cannot
block video readiness. Source cleanup aborts downloads and releases these URLs.
Subtitle failures show a separate warning and keep the video running.
Image/styled subtitles use burn-in.
Local extras, Discover trailers, card previews, and full playback share this
engine. Local extras use the same fallback controller; Discover has its own source
resolver. Plex supplies conversions; Nevu has no separate transcoder.

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
