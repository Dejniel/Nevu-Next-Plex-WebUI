# Testing

Choose verification for the affected behavior:

- Logic, cache lifecycle, and request contracts: focused automated tests without
  Plex; use the full suite when shared behavior changes.
- Runtime changes: production build and relevant integration checks with Plex.
- Configuration or hardware behavior: an environment representing those conditions.
- Documentation changes: check links, commands, and configuration examples.

Commands are listed in [Development](../README.md#development). Record which
checks passed and which scenarios remain unverified when an environment or
account capability is unavailable.

Backend tests use temporary SQLite databases to check initialization, existing
settings, profile isolation, parameterized writes, and persistence after reopening.

## Standalone Plex + Nevu

`compose.test.yaml` builds Nevu from the checkout and starts a separate Plex with
its own configuration, volumes, and network. Ports bind to localhost and both
containers use `restart: "no"`. Run from the repository root:

```bash
export PLEX_TEST_MEDIA_PATH=/tmp/nevu-test-media
mkdir -p "$PLEX_TEST_MEDIA_PATH"
docker compose -f compose.test.yaml up --build -d
```

Open Plex at `http://localhost:32401/web`, sign in, and complete server setup.
Optionally set `PLEX_TEST_CLAIM` from [plex.tv/claim](https://www.plex.tv/claim)
before the first start. Add sample media to the directory and create libraries
under `/data`. Include movies, episodes, versions, audio tracks, or subtitles
needed by the scenario. Open Nevu at `http://localhost:3101` and sign in.

Check TV `Seasons` across shows and `Folders` in movie, TV and music libraries.
Use nested folders with mixed files; verify breadcrumbs, Up, browser history,
reload and media actions. Switching type should select its grid/list presentation
and preserve preferences. Check mobile fit, empty/error recovery and cached range
jumps in grids, track lists and galleries.

For music/photo libraries, check artist → album → tracks, disc order, playback
during navigation, queue add/remove/reorder and repeated songs. Include native
audio and a format requiring Plex conversion. Verify HLS and DASH audio decisions,
relative session segments, seeking and cancellation while switching tracks/profiles.
Check repeat off/queue/one, manual skips, shuffle/unshuffle without restarting the
current track, and removing the current entry. Reload after seeking in original and
converted audio: the same queue occurrence and position should return paused.
An expired/deleted Plex queue should disappear; Stop should clear the saved selection.
Rate/clear tracks, artists/albums and photos/photo albums; verify the active profile
and rating-dependent filters. Check permitted original-file downloads and version
selection, including WMA/ALAC and photos. Compare downloaded bytes with originals,
and verify actions in the expanded music player and fullscreen photo viewer.
Check nested and mixed photo/video albums, their filters and sorting, and the
chronological `All photos` view, including photos from nested albums. Verify
arrows/swipes across albums, zoom/pan, slideshow, empty-filter recovery and return
to the same gallery position. Queue/profile lifecycle and request contracts also
have mocked tests; browser playback with synthetic audio does not verify PMS
conversion or device codec support.

Ports are configurable through `PLEX_TEST_PORT` and `NEVU_TEST_PORT`.
For a remote host, forward the localhost ports through an SSH tunnel.
Use `PLEX_TEST_IMAGE` to select a Plex version and record it with test results.
Authentication and online metadata features still use Plex services.

For playback checks, generate synthetic samples with local FFmpeg:

```bash
bash tools/generate-playback-samples.sh "$PLEX_TEST_MEDIA_PATH/PlaybackSamples"
```

Add `/data/PlaybackSamples` as a movie library. Samples cover MP4 (including a
ten-minute file with metadata at the end), MKV with two
audio tracks and SRT, AC3, styled ASS, VP9 (libvpx), and HEVC Main 10 (libx265).
Check Original, lower bitrate, track changes while paused, subtitles, seeking,
resume, trailers, and Watch Together. Every Plex source must negotiate HLS/DASH
through `/decision`; preparation/start must use the same session and parameters.
Original quality must still fetch segments, with no video request to
`/library/parts/.../file`. Verify start before the complete media is downloaded
and bounded buffering on a long sample, including MP4 with metadata at the end.
After a decoder/format failure, allow one different negotiated H264/AAC alternative.
Network retries must keep the source/session, and subtitle failures must warn
without restarting video. Check retained pause/position, stale events after an
item/profile change and terminal HTTP 401/403/404 errors.
For copied video, check seeking outside the buffer: decoded frames/audio
must resume near the requested position, including files with long GOPs.
Check continuous video buffering across segment boundaries and playback while
subtitle extraction is still pending; subtitle downloads must not stall video.
Inspect stream parameters and Plex's active session to distinguish copying from
conversion; a decision alone does not prove playback. Text subtitle extraction
authorizes its own read after video readiness. Browser/device codec support,
native Safari HLS, HDR, and hardware transcoding require suitable environments.

On title pages, resize through desktop/mobile layouts and change text size.
Check action overflow, keyboard focus, and original-file selection from the menu.
Save and clear a rating, including a failed request.
Check 0–10 scores and provider labels on cards, details and reviews, with separate
Rotten Tomatoes critic/audience scores and no computed friend average. A missing
score must stay absent. Change title/profile during a pending rating save.
Check spoiler expansion, creating/editing a review, failed saves, and profile
changes during a save. Check the review editor from the star menu and both section
headers; your review should appear once, first in Recent, immediately after saving.
Live review writes use the account’s Plex privacy settings.

For server/library preferences, check grouping, search, advanced options, empty
enum choices, boolean descriptions, decimal values, default restoration and
mobile labels. Save one field and verify that untouched preferences are omitted.
Refresh while editing, retry a failed save, and change profile/server during both
the write and subsequent read. Verify restricted/non-manager access and hidden
fields using mocked endpoints. Use only standalone Plex for automated settings
writes; connection and transcoder settings require representative environments.

Plex Home, reviews and sharing change the cloud account even from a standalone
server. Use mocked writes for automation. Check draft preservation on background
refresh, partial Home edits, inline errors/retry, and profile changes during both
the write and subsequent revalidation. Verify that Home membership changes also
refresh library access, while PINs stay outside storage and the mutation cache.

For list browsing, create a collection and video/audio playlists in test Plex using
the samples. Check their library views, search, empty states, and back links.
Check the top bar at narrow desktop widths, long library names, overflow-menu
keyboard focus, and profile-specific pins/order/icon mode. Mobile should retain
full names and keep its drawer open while arranging libraries.
Verify playlist order with Next, playback completion, and returning to the list;
include repeated titles, episodes, and another profile when available. For large
lists, check the last item and retry a failed page or playback queue.
Jump away and back to cached ranges: cards should appear without an intervening
empty frame or another page read. Check poster crossfades (500 ms), reduced motion,
window/contained scrolling, resizing and lists with an initially unknown total.
Check adding from cards and title details to existing and new lists, preserving
their contents, and action availability for users without management permission.
Edit playlist name/description, move entries to arbitrary positions and First/Last,
remove individual occurrences, and confirm deletion. Check mobile/keyboard input,
profile changes during saves, empty results, and retained scroll after edits.
For smart playlists, check metadata/deletion and disabled manual item editing.
For music playlists, add tracks and complete albums/artists from their menus,
verify audio/video separation, and start playback at a selected track or shuffled.
Edit saved contents while the native playback queue continues independently.
Check music playlist rows, album/artist links and the same editing dialogs on mobile.
Change titles and list contents in Plex while browsing Nevu; check background
updates, retained scroll/filters, hidden-tab return, connection recovery and Retry
after a failed refresh. Include a scrolled multi-page list and profile switches.
Jump to a distant range after replacement page requests have started; obsolete
requests must not block publication, and another consumer must retain its shared
page. Delete an episode in test Plex and check season/show counts and On Deck.
Check that edited genre/actor tags refresh filter options, while description-only
edits preserve unaffected discovery directories.

Stop with `docker compose -f compose.test.yaml down`. Adding `-v` resets the
test stack's volumes; sample media remains in the host directory.
