# Product roadmap

Status: active

This document lists planned product work. Completed functionality belongs in
the README and release notes; implementation-only cleanup belongs in the
[refactoring roadmap](refactoring-roadmap.md).

## Now

### Complete metadata workflows

- Add the remaining editable fields exposed by Plex for each media type.
- Extend manual matching with external identifiers and provider selection.

## Next

### Multiple selection and batch actions

- Add shared multiple selection to library grids and detailed lists for video,
  music and photos, with mouse, keyboard and touch support.
- Apply existing actions to selected items according to media type and Plex
  permissions, such as adding to lists or marking video watched/unwatched.
- Reuse selection when adding photos to user-created albums.

### Music and photo workflows

- Extend photo zoom with pinch/actual size and add slideshow settings.

## Later

### Search and smart lists

- Extend global search to artists, albums, tracks and photos; this remains
  deferred while the basic music/photo workflows are completed.
- Add creation and editing of smart playlist/collection rules, with Plex
  evaluating list membership.

### Experience improvements

- Consider gapless music playback, lyrics and music recommendations as separate extensions.
- Refine artist/album pages, the persistent music player and queue, and the photo
  gallery for desktop and mobile.
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
