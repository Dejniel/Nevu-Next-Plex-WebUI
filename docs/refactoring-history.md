# Refactoring history

Status: structural migration completed on 2026-09-29

## Dependency modernization and cleanup — 2026-10-05

- Updated runtime, build tools, TypeScript, frontend packages, and Express.
- Removed Prisma and its startup CLI; SQLite now stores only profile settings.
- Removed local/global Nevu reviews and unused UDP discovery, font packages,
  Moment, and legacy token/library preference migrations.
- Added backend lint to CI and weekly dependency checks. Written Plex reviews
  remain a separate product task; ratings and review display stay supported.
- Old token storage requires signing in again; old library visibility settings
  fall back to the default pins. Current sessions and navigation are retained.

## Unified playback — 2026-09-30

Films, extras, hero trailers, and card previews now share `<video>` + npm Shaka
Player. Reusable Plex negotiation and session ownership live in `entities/media`;
the routed playback feature retains track selection, timeline, queue, and sync.
ReactPlayer, hls.js, and the previous separate extra player were removed.

## Why this work exists

The frontend grew around horizontal directories (`components`, `pages`,
`plex`, and `states`). A single workflow consequently spans several unrelated
folders, Plex requests are easy to issue directly from UI code, and changing a
screen often requires understanding much more of the application than the
screen itself.

The goal is to organize the frontend around user-visible workflows with clear
ownership of API calls, state, domain logic, and UI. This is an incremental
architecture migration, not a rewrite and not an attempt to minimize the line
count at any cost.

The target rules and dependency direction are documented in
[`architecture.md`](architecture.md).

## Desired end state

```text
src/
  app/                 bootstrap, providers, routes, theme, application shell
  entities/<entity>/   reusable domain data, model helpers, and domain UI
  features/<feature>/  complete user workflows: API, model/state, and UI
  shared/              domain-neutral API transport, UI primitives, utilities
```

The important outcomes are:

- A workflow can be understood and changed mostly inside one feature.
- Plex/backend requests have one owner and do not originate ad hoc in UI.
- Code outside a feature uses its narrow `public.ts`, not internal paths.
- Reusable media concepts live in `entities`, not in an arbitrary feature.
- Global state is limited to genuine session/application state.
- Legacy directories disappear as their actual consumers are migrated.
- User-visible behavior remains stable while the structure changes.

## Completed foundation

### Application and library boundary

Commit `c38eb63` (`Refactor frontend around feature boundaries`):

- Split bootstrap, providers, routes, configuration, and theme into `app`.
- Added the shared authenticated Plex client and backend URL module.
- Moved the complete browse/library workflow into `features/library`.
- Added the first documented feature boundary and public entry point.

### Title details

Commit `aa9277c` (`Move title details into a feature module`):

- Moved metadata, extras, reviews, downloads, editing, and details UI into
  `features/title-details`.
- Removed the corresponding scattered component, hook, and Plex modules.
- Exposed only the routed/details surface required by other modules.

### Shared media entity

Commit `c09e9cf` (`Extract the shared media entity`):

- Created `entities/media` for media models, artwork/version helpers, preview
  state, cards, and watchlist controls shared by multiple workflows.
- Added separate `public.ts` and headless `model.ts` entry points so model/API
  code does not accidentally load React UI.

### Playback

Commit `8b8956c` (`Move playback into a feature module`):

- Moved the routed player, episode browser, queue controls, tuning controls,
  subtitle search, stream requests, and presentation helpers into
  `features/playback`.
- Removed the old playback files and playback request functions from the
  catch-all Plex module.
- Kept watch-together synchronization outside playback intentionally; it is a
  separate cross-session workflow.

### Watch-together synchronization

Commit `1558a2b` (`Extract watch-together synchronization feature`):

- Moved the socket transport, connection state, room dialog, waiting room, and
  synchronization notifications into `features/watch-together`.
- Replaced direct Socket.IO access in playback with a small public controller.
- Removed the old event emitter, unused playback cache, and scattered sync
  components/state.
- Added model and connection-lifecycle tests.

### Playback media controller

Commit `9f2a7f2` (`Extract playback media controller`):

- Moved metadata loading, queue context, source URL construction, quality,
  media-version selection, track preferences, and downloaded-subtitle
  activation into a single playback-owned controller.
- Added request-generation guards so stale item/source requests cannot replace
  current playback state.
- Kept queue/show context valid across quick source changes instead of letting
  a quality change cancel it.
- Extracted the playback information overlay and settings popover from the
  routed player screen.
- Follow-up hardening restored the intended API-to-model dependency direction,
  gave the settings UI a narrow controller view model, and made subtitle
  attachment stop cleanly when the active item or source changes.

### Architecture guardrails

- Cross-feature and cross-entity imports are checked automatically: consumers
  use `public.ts`, or an explicitly approved root `model.ts` headless entry
  point.
- Layer direction is checked automatically, with only the session request
  context allowed as an entity-to-feature dependency.
- New root-level runtime modules are rejected so legacy horizontal buckets do
  not grow back under new names.
- Playback transport URL construction lives in `api`; quality, subtitle
  contracts, and pure selection helpers live in `model`.

### Playback interaction controller

- Player runtime state, resume handling, volume persistence, and the minimal
  player adapter live outside the routed screen.
- UI controls and keyboard shortcuts execute the same playback commands for
  play/pause, seeking, volume, fullscreen, markers, navigation, and completion.
- Timeline and transcode-session reporting is isolated, prevents overlapping
  requests, and cannot block navigation after a failed final report.
- The next-episode overlay receives a typed action instead of knowing about the
  player ref, router, and Plex query format.

### Playback controls layout

- The control bar, progress and volume controls, settings popover, marker
  actions, visibility timing, and cursor behavior live in one playback-owned UI
  component.
- The controls consume the existing media, runtime, and command controllers;
  they do not duplicate playback state or create another controller layer.
- Marker presentation uses the same active-marker model as keyboard commands
  instead of scanning metadata separately for every action.
- The routed playback screen is now a small composition boundary responsible
  for synchronization, errors, informational overlay timing, and mounting the
  actual player.

### Home discovery

- The routed home screen, hero presentation, random hero selection, genre
  shelves, and their Plex requests live together in `features/home`.
- Home composes the public library shelf, media, and title-details contracts
  instead of duplicating their card, watchlist, or trailer behavior.
- Home requests now fail explicitly and stale results cannot replace the
  current profile's content after settings or library navigation change.
- The old home page, hero components, global recommendation-shelf type, and
  Plex-level home helper were removed.

### Authentication and Plex sessions

- Login, Plex PIN exchange, Plex Home profile selection, persisted credentials,
  server identity, and management capability checks live in `features/session`.
- The active Plex user and profile now come from one session store; the old
  duplicate user and server session stores were removed.
- Session changes have an explicit revision used to reinitialize profile-owned
  settings, libraries, and watchlist data without coupling the session feature
  to those legacy stores.
- Stale profile and server requests cannot restore data after a profile switch,
  and unmounting the authenticated application closes Watch Together sessions.

### Settings, search, and library navigation

Commits `baa2456`, `fc4e5ac`, and `1f562fe`:

- Moved account, playback, sharing, library administration, and user settings
  into `features/settings`.
- Created the reusable `entities/library` model/API boundary and moved pinning,
  ordering, and library menu behavior into `features/library-navigation`.
- Moved search requests, stale-response handling, result partitioning, and both
  search entry points into `features/search`.

### Application bar decomposition

Commit `deea922`:

- Moved search input, suggestions, keyboard navigation, and result routing into
  `features/search`, with focused tests for route selection.
- Moved responsive library links, overflow navigation, library action state,
  and library reload handling into `features/library-navigation`.
- Reduced the application bar to shell composition, account controls, and the
  mobile drawer; desktop and mobile feature variants no longer mount together.

### Title details data orchestration

Commit `fd3d0a6`:

- Moved title identity resolution, metadata loading, initial season selection,
  episode loading, and track-language discovery into one feature-owned model.
- Added cancellation guards so stale season, title, and track requests cannot
  replace the current dialog state.
- Removed duplicated episode fetching and covered season selection and track
  normalization with focused tests.

### Watchlist and legacy cleanup

Commits `143ff6e`, `89b1557`, `c79345b`, `76a15b3`, `7c5885d`, and `a8b6ae8`:

- Removed the catch-all `plex/index.ts` after assigning media, library, rating,
  and image operations to their owners.
- Moved Plex Discover watchlist API, profile-aware state, and watchlist UI into
  `features/watchlist`; removed the global event emitter and stale mutation
  races.
- Moved the application bar and startup diagnostics into `app`, and generic
  dialogs, links, notifications, and loading UI into `shared/ui`.
- Split `QuickFunctions.ts` into session-owned authenticated Plex requests,
  media include parameters, and focused shared query, platform, and identifier
  utilities.
- Removed the executable `components`, `pages`, `states`, `common`, and legacy
  `plex` modules. `plex/plex.d.ts` remains only as the global Plex data contract.
- Moved shared route builders under `shared/lib/navigation`.

### Reusable media actions

- Reduced the shared media card to presentation, artwork, and preview behavior.
- Moved playback resolution, watchlist and watched-state actions, original-file
  downloads, and reusable card menus into `features/media-actions`.
- Added Plex metadata editing, Match/Fix Match, and Unmatch as tested,
  manager-only workflows and split the primary title actions and rating control
  out of the details screen.
- Extracted the card's lazy metadata lifecycle into `useLazyMediaMetadata`,
  including guarded request sharing, invalidation, retries, and local updates.
- Centralized media action availability and shared immutable watched-state
  updates across cards, title details, and episode rows.

At this point `app`, `home`, `library`, `title-details`, `playback`,
`watch-together`, `session`, `settings`, `search`, `library-navigation`, and
`watchlist`, together with `media-actions` and the shared `media` and `library`
entities, form the active frontend structure.

## Resulting conventions

- All product workflows expose public entry points. Non-UI consumers use
  the current headless `model.ts` contracts checked by
  `architectureBoundaries.test.ts`.
- The session headless model is a deliberate cross-cutting dependency for the
  current Plex token and request context.
- `frontend/src/plex/plex.d.ts` is a type declaration, not a compatibility
  implementation; runtime code now belongs to feature, entity, or shared modules.
- Playback intentionally consumes the public watch-together controller. It
  does not depend on socket transport, room state internals, or sync UI.

Future structural work is tracked separately in
[`refactoring-roadmap.md`](refactoring-roadmap.md). Current dependency and
ownership conventions remain documented in [`architecture.md`](architecture.md).
