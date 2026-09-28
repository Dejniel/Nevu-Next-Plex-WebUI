# Frontend architecture

The frontend is being migrated from horizontal, application-wide folders to
vertical feature modules. New work should follow the structure below; existing
legacy files can move incrementally when they are changed for a real feature.

## Layers

```text
src/
  app/                 application bootstrap, providers, routes, and theme
  features/<feature>/  feature-owned API, model, state, and UI
  shared/              domain-neutral transport, UI primitives, and utilities
```

The intended dependency direction is:

```text
app -> features -> shared
```

A feature may temporarily use legacy modules such as `plex`, `components`, or
`states` while those areas are migrated. Legacy infrastructure must not import
feature UI. Cross-cutting notifications belong in `shared`, which prevents
cycles between old infrastructure and new feature state.

## Feature boundaries

Each feature exposes its supported surface through `public.ts`. Code outside a
feature imports from that file instead of reaching into `api`, `model`, or `ui`.
Files inside the same feature use direct relative imports so their ownership is
visible and barrel-file cycles are avoided.

Entities may additionally expose a headless `model.ts` entry point. API and
model code should use it when importing the main `public.ts` would also load UI
dependencies.

The library module is the reference implementation:

```text
features/library/
  api/       Plex/backend requests and transport error mapping
  model/     filters, sorting, range cache, and pure transformations
  ui/        routed screen and library-specific components
  public.ts  exports used by the rest of the application
```

`features/title-details` follows the same boundary for title metadata, extras,
reviews, downloads, and the details dialog. Playback-specific subtitles and
media-version selection remain outside it until the playback feature moves.

## API and state rules

- Plex authentication headers and HTTP error conversion live in
  `shared/api/PlexClient.ts`. Legacy request helpers are compatibility adapters.
- Feature API modules translate transport data into the feature contract.
- Server data caches are feature-owned. Global stores should contain session or
  application state, not copies of feature query results.
- Pure parsing, normalization, and query-key functions stay in `model` and have
  focused unit tests.
- Components do not create ad hoc Plex requests when a feature API already owns
  that operation.

## Migration workflow

1. Pick one user-visible workflow, not one file type.
2. Move its request code, model/state, and UI into one feature.
3. Add a narrow `public.ts` and update all external imports to use it.
4. Remove old adapters and directories once no caller depends on them.
5. Run the focused tests and a production build before committing.

Avoid creating empty layers or generic abstractions in anticipation of future
features. A shared abstraction is justified only after it has a concrete user.
