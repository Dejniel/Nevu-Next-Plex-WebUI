# Product roadmap

Status: active

This document lists planned product work. Completed functionality belongs in
the README and release notes; implementation-only cleanup belongs in the
[refactoring roadmap](refactoring-roadmap.md).

## Now

### Complete metadata workflows

- Add the remaining editable fields exposed by Plex for each media type.
- Support posters, backgrounds, tags, and other multi-value fields without
  overwriting values the user did not edit.
- Extend manual matching with external identifiers and provider selection.

## Next

### Library view types

- Add `Seasons` to the TV library type selector, showing seasons across the library.
- Add `Folders` to movie and TV libraries, browsing nested folders and their media
  within the selected library.

### Server settings

- Build an administrator-only, API-driven settings screen grouped by Plex
  metadata rather than a hard-coded form.
- Save only changed values and identify options that require a restart or have
  significant side effects.

### Plex Home management

- Manage Home members, profile restrictions, and supported add, edit, remove,
  and PIN operations according to the active user's permissions.
- Keep local interface preferences isolated per profile and never store a PIN
  as plain text.

## Later

### Music and detailed lists

Add artists, albums, tracks, queues, and a detailed list layout designed around
music rather than adding a movie-only table first.

### Photo libraries

Browse Plex photo libraries, albums, and individual photos.

### Experience improvements

- Add removal of a written Plex review while preserving ratings and watch history.
  Plex's [current delete operation](https://support.plex.tv/articles/user-reviews/)
  removes both rating and review; confirm a text-only operation first.
- Revisit Home separately for desktop and mobile.
- Consider an alternative title-details layout that is less dependent on a
  large backdrop while preserving the current cinematic view.

### Multiple Plex servers

Treat combined libraries as a separate source architecture covering tokens,
deduplication, routing, availability, and playback rather than merging result
arrays in the UI.
