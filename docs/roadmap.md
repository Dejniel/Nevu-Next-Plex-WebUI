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

### Music and photo workflows

- Extend photo zoom with pinch/actual size, slideshow settings and multiple selection.
- Extend metadata/artwork editing to music and photos through existing workflows.

### Library view types

- Add `Seasons` to the TV library type selector, showing seasons across the library.
- Add `Folders` to movie and TV libraries, browsing nested folders and their media
  within the selected library.

## Later

### Experience improvements

- Consider gapless music playback, lyrics and music recommendations as separate extensions.

- Extend Plex Home editing with profile pictures and custom rating/label restrictions;
  preserve existing restrictions when changing library access.
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
