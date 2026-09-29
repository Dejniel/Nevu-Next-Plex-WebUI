# Frontend refactoring roadmap

Status: 2026-09-29

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

At this point `app`, `home`, `library`, `title-details`, `playback`,
`watch-together`, `session`, and the shared `media` entity form the reference
structure for subsequent work.

## Current state and constraints

- `features/home`, `features/library`, `features/title-details`,
  `features/playback`, `features/watch-together`, and `features/session` expose
  public entry points. External callers must not import their internals.
- `frontend/src/plex/index.ts` is still a compatibility module. Do not expand
  it; move operations to the feature that owns them when touching a workflow.
- `frontend/src/components`, `pages`, `plex`, and `states` still contain mixed
  legacy responsibilities. Their existence is temporary, but empty directory
  removal is not itself a refactoring objective.
- `PlaybackScreen.tsx` is now roughly 7.5 KB and only composes the playback
  controllers, watch-together integration, overlays, error handling, and the
  actual player.
- Playback intentionally consumes the public watch-together controller. It
  must not reach into socket transport, room state internals, or sync UI.
- `TODO.md` and `BRUDNOPIS.md` are personal, untracked planning files. Do not
  add or rewrite them as part of this roadmap.

## Next steps

Treat the following as a default sequence, not a fixed specification. Recheck
the dependencies and expected payoff before each stage. Each migration should
still follow a vertical workflow rather than bulk-moving an old directory.

### 1. Extract settings and administration

Move account, playback, sharing, library administration, and server settings
from `pages/settings`, `components/settings`, and Plex helpers into a settings
feature. Group API operations by capability instead of recreating one large
`settingsApi.ts` or moving the old catch-all module unchanged.

Library CRUD may depend on reusable library entities/API contracts, but the
administration UI should not be added to the browse feature merely because
both mention libraries.

### 2. Finish smaller workflows

Migrate the remaining routed workflows according to their behavior:

- search;
- watchlist;
- top-level library selection/navigation;
- utility pages that are still product functionality.

Only after their consumers are gone should the corresponding legacy Plex,
page, component, hook, and state files be removed.

### 3. Close the compatibility layer

When no feature depends on `plex/index.ts`, delete it and import the shared
transport or feature-owned API explicitly. At the same time:

- move truly generic dialogs, links, spinners, and notifications to
  `shared/ui`;
- keep application-shell components in `app`;
- remove obsolete adapters and empty legacy directories;
- verify that no feature imports another feature's internal path.

Do not create a generic repository/service framework solely to complete this
step. Shared code must have more than one real consumer.

## Definition of done for each migration

A feature migration is complete only when:

1. API, model/state, and UI ownership are clear inside the feature.
2. External imports go through `public.ts` (or an intentional headless entity
   entry point).
3. The old files/adapters have no callers and are removed.
4. Pure transformations and request contracts retain focused unit tests.
5. The full frontend test suite and production build pass.
6. The affected workflow is smoke-tested in the disposable test container.
7. The change is recorded as a focused local commit before starting the next
   workflow.

Avoid combining architecture migration with visual redesign or new product
behavior. If behavior must change, make it an explicit separate commit so a
regression can be identified and reverted independently.

## Resume checklist

Before continuing after a break:

```bash
git status --short
git log -8 --oneline
cd frontend
npm test -- --watchAll=false
npm run build
```

Then select exactly one item from **Next steps**, inspect all of its callers,
and migrate it end to end. Do not start by moving all files from one legacy
directory.

Current verified baseline:

- tests: 44 suites, 147 tests passing;
- production build: passing;
- disposable validation container: `nevu-refactor-test` on host port `3101`;
- production `nevu-next` on port `32400` was not modified by this refactor.
