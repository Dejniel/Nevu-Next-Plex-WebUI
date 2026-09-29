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

At this point `app`, `library`, `title-details`, `playback`,
`watch-together`, and the shared `media` entity form the reference structure
for subsequent work.

## Current state and constraints

- `features/library`, `features/title-details`, `features/playback`, and
  `features/watch-together` expose public entry points. External callers must
  not import their internals.
- `frontend/src/plex/index.ts` is still a compatibility module. Do not expand
  it; move operations to the feature that owns them when touching a workflow.
- `frontend/src/components`, `pages`, `plex`, and `states` still contain mixed
  legacy responsibilities. Their existence is temporary, but empty directory
  removal is not itself a refactoring objective.
- `PlaybackScreen.tsx` is still large (roughly 44 KB), but media/source
  orchestration and the two independent overlays have moved out. The remaining
  size is concentrated in player lifecycle, controls, markers, and keyboard
  interaction.
- Playback intentionally consumes the public watch-together controller. It
  must not reach into socket transport, room state internals, or sync UI.
- `TODO.md` and `BRUDNOPIS.md` are personal, untracked planning files. Do not
  add or rewrite them as part of this roadmap.

## Next steps

Treat the following as a default sequence, not a fixed specification. Recheck
the dependencies and expected payoff before each stage. Each migration should
still follow a vertical workflow rather than bulk-moving an old directory.

### 1. Finish playback interaction decomposition

The media/source controller is complete. The remaining cohesive responsibilities
that may be worth extracting from `PlaybackScreen.tsx` are:

- timeline reporting and resume position;
- playback controls and keyboard behavior;
- player layout and overlays.

Keep these inside `features/playback` unless another concrete feature needs
them. Prefer a small number of meaningful hooks/components over wrappers,
decorative helpers, or one-variable abstractions.

### 2. Extract home discovery

Move the home workflow (`Home`, `HeroDisplay`, hero selection/media logic, and
home shelves) into `features/home`. Reuse library query/model code through its
public contract or move genuinely reusable media-query concepts to an entity;
do not duplicate library pagination and artwork logic.

This step should leave home hero loading, trailer behavior, and shelf browsing
unchanged.

### 3. Consolidate authentication and profiles

Give login, startup, Plex PIN flow, profile bootstrap/picker, server access,
and user session state a deliberate boundary. Decide based on actual coupling
whether this is one `features/session` module or separate `auth` and
`profiles` features. Do not preserve both `auth` and `states` wrappers around
the same data.

Session state is one of the few valid application-wide stores. Keep persisted
credentials and active Plex Home profile handling out of presentation code.

### 4. Extract settings and administration

Move account, playback, sharing, library administration, and server settings
from `pages/settings`, `components/settings`, and Plex helpers into a settings
feature. Group API operations by capability instead of recreating one large
`settingsApi.ts` or moving the old catch-all module unchanged.

Library CRUD may depend on reusable library entities/API contracts, but the
administration UI should not be added to the browse feature merely because
both mention libraries.

### 5. Finish smaller workflows

Migrate the remaining routed workflows according to their behavior:

- search;
- watchlist;
- top-level library selection/navigation;
- utility pages that are still product functionality.

Only after their consumers are gone should the corresponding legacy Plex,
page, component, hook, and state files be removed.

### 6. Close the compatibility layer

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

- tests: 37 suites, 138 tests passing;
- production build: passing;
- disposable validation container: `nevu-refactor-test` on host port `3101`;
- production `nevu-next` on port `32400` was not modified by this refactor.
