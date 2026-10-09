# Frontend refactoring roadmap

Status: active

The feature-based migration is complete. This roadmap covers targeted
maintenance that lowers regression risk or makes planned product work easier.
It is not a second rewrite and should not drive file movement for its own sake.

## Priorities

### Current focus

- Reduce large composition components where it clarifies a workflow or supports
  planned product work.
- Migrate endpoint-specific Plex contracts alongside the affected workflows.

### Later

- Improve request-specific Plex types and gradually retire the global `Plex`
  namespace.

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

`features/media-actions/model/useLazyMediaMetadata` uses the canonical Query
resource shared by cards, previews, Home and details. It retains mounted-action
and session guards, while Query owns cache/status/request sharing/cancellation.
Match/Unmatch invalidate it; confirmed edits update the shared response.
The [follow-up](browse-cache-followup.md) also migrates sections, directories,
recommendation context, episodes, GUID resolution and Discover extras.

### 2. Media action capabilities and watched state — complete

`features/media-actions/model/mediaActionCapabilities` decides availability for
Edit, Match, Unmatch, Download, View Similar, and watched-state actions. Cards
and title details use the same decisions. `entities/media` owns watched-state
recognition. `useConfirmedMediaAction` owns single/batch writes, pending state,
errors and partial retries. Cards, details and episodes use one application-level
host; session changes cancel obsolete requests. Watched metadata comes only from
Plex synchronization, without local view-count copies. Unmatch uses the same
confirmation controller. Tests cover permissions, cancellation, partial failure,
retry and canonical updates.

### 3. Isolate matching state — complete

`useMetadataMatch` owns the draft and selection; Query owns reads, cancellation
and mutation status. The dialog renders the model and user events. Edit and Match
share the application-level dialog host and captured-session permission checks;
matching menu actions are shared by video and music. Native identifier searches
and PMS-provided agents cover movies, shows, artists and albums.

### 4. Reduce title-details composition — complete

Tab selection comes from the URL; navigation has a separate accessible view.
`useTitleEpisodes` owns season selection and canonical Query reads;
`useEpisodeActions` adapts scoped selection to the shared media-action controller.
Rows render Query metadata directly. `shared/lib/useItemSelection`
stores scoped IDs and supplies the foundation for future library selection.
Static hero composition remains in the screen.

### 5. Improve Plex contracts gradually — in progress

Replace global `Plex` types with imported request and view models one endpoint
family at a time. Start where a product change already requires understanding a
response shape; avoid a repository-wide type-only rewrite.

Video queue occurrences, timeline replies, artwork choices and current-cast
snapshots now have checked response contracts. The metadata editor uses its own
editable-field model; video and playlist queues share occurrence validation.
Envelope/collection checks are shared with Match. Full video/music/photo metadata,
file/stream details and child records now share one decoder with canonical sync;
the old global metadata/file types are removed. Playback decisions have a separate
checked contract. Availability, Discover extras, music queue occurrences and
browse/list response contracts remain to migrate.

### 6. Make Plex notification updates more selective — complete

Delivered with the browse cache workstream above. Known stable changes patch
compatible cached occurrences; membership/dependency changes stage scoped windows.
Backend random catalogs share those decisions. Unknown predicates and missed
notifications still require recovery, with measured scan and request limits.

### 7. Separate library administration workflows — complete

`SettingsLibrariesAdmin` composes the URL-driven editor and managed list.
`LibraryEditorDialog` and `LibraryFolderBrowser` have separate lifetimes;
`useLibraryEditor` owns sparse fields, validation and payload construction.
Existing administration queries/mutations and Plex preference fields remain the
request/advanced-setting owners. Untouched fields follow background reads;
failed saves retain edits, and session changes cancel obsolete requests.

## Verification

Choose checks for the affected behavior using [testing.md](testing.md). Record
the results and any unverified scenarios; access to a particular server or
container is not a prerequisite for every refactor.
