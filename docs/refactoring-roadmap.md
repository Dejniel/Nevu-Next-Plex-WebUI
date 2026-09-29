# Frontend refactoring roadmap

Status: active, incremental

The feature-based migration is complete. This roadmap covers targeted
maintenance that lowers regression risk or makes planned product work easier.
It is not a second rewrite and should not drive file movement for its own sake.

## Priorities

### Current focus

- Simplify reusable media actions and make their loading and permission rules
  explicit and testable.
- Continue reducing large composition components only when the affected area is
  already changing for a product feature.

### Later

- Improve request-specific Plex types and gradually retire the global `Plex`
  namespace.
- Revisit match state management when matching gains more criteria, providers,
  or support for additional media types.

## Working rules

- Preserve the dependency direction documented in
  [`architecture.md`](architecture.md).
- Keep transport in `api`, pure decisions and transitions in `model`, and UI
  coordination in `ui`.
- Prefer one clear owner over generic abstractions shared by unrelated flows.
- Add focused tests for pure logic and request contracts; do not refactor solely
  to make component rendering tests possible.
- Complete one coherent slice, remove the replaced implementation, and keep the
  application runnable between slices.

## Recommended starting slices

### 1. Extract the lazy media metadata resource

`ActionableMediaCard` currently owns the cached full metadata, request status,
in-flight promise sharing, stale-response generation, and invalidation after
Match or Unmatch.

- Move that lifecycle into a focused `useLazyMediaMetadata` hook owned by
  `features/media-actions`.
- Expose only `data`, `status`, `load`, `invalidate`, and a local update method.
- Keep concurrent callers on one request and prevent a response for an old card
  from replacing the current item.
- Cover request reuse, invalidation, failure retry, and stale responses with
  focused tests.

### 2. Model media action capabilities and watched state

Rules for local versus Plex.tv items, server management, media type, matching,
and downloads are currently evaluated in more than one UI component.

- Add a pure capability model for Edit, Match, Unmatch, Download, View Similar,
  and watched-state actions.
- Move `isMediaWatched` out of the menu component.
- Add a pure watched-state transition used by both cards and title details.
- Test representative movie, show, episode, remote-source, and non-manager
  combinations.

### 3. Isolate matching state when the workflow expands

The current dialog is acceptable for title, year, and language matching. Before
adding identifier searches, provider selection, or episode matching:

- move criteria, results, selection, loading, errors, and request generations
  into a `useMetadataMatch` controller;
- keep candidate normalization and request construction in the existing model
  and API modules;
- leave the dialog responsible only for rendering and user events.

### 4. Reduce title-details composition incrementally

`TitleDetailsScreen` remains the largest composition surface. Split it by
coherent workflows as those workflows change, starting with tab routing and
episode actions. Do not divide static markup into thin wrapper components only
to reduce the line count.

### 5. Improve Plex contracts gradually

Replace global `Plex` types with imported request and view models one endpoint
family at a time. Start where a product change already requires understanding a
response shape; avoid a repository-wide type-only rewrite.

## Completion criteria

A refactoring slice is complete when ownership is clearer, the old path is
removed, focused tests and the production build pass, and the affected workflow
has been checked in the disposable test container.
