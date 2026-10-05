# Remaining browse and metadata queries

Completed on 2026-10-05 after the [three-stage migration](browse-cache-and-plex-sync-plan.md).

Cards, hover previews, Home heroes, details and playback selection share the
canonical metadata query. Lazy card actions retain only mounted-item/session
guards; Query owns their data, status, requests and cancellation. New props for
the same Plex ID keep the shared cache. Match/Unmatch invalidate it; confirmed
edits cancel older reads before publishing. Playing a show explicitly refreshes
On Deck before selecting an episode.

Library sections, raw directories, recommendation context, Home discovery,
GUID resolution, seasons/episodes and Discover extras now use native queries.
Removed the sections Zustand store, its DOM refresh event, duplicate Home/section
API functions and the unused card refresh callback. Directory keys include request
parameters; library/list synchronization reads keys through typed helpers.

The existing event batch also reconciles directories, discovery and child lists.
Confirmed episode metadata can patch a season without another read; membership,
parent changes and uncertain dependencies revalidate affected resources. Cold
reads are cancelled before revalidation. Ordinary playback/metadata changes keep
a usable hero selected. Failed background reads retain usable cached details.
The player's episode browser loads the selected season on demand, sharing the
same child queries as details, instead of downloading every episode of the show.

Verification: 488 frontend tests, types/lint/production build, 48 backend tests in
the built image, backend lint and Docker build pass. Chromium verifies one shared
sections read, one movie metadata read across Home/hover/card/details, cached
season returns, shared genre responses and section schema across Browse/Recommended.
Home windows/genres and TV responses are controlled; no cloud or Plex data is
changed. Full media playback remains outside this environment's verification.
Test containers retain `restart: "no"`.

Against `3e1ad20`: application +1,156/-1,271 lines (**-115**); tests +838/-256
(**+582**), excluding docs. Across the entire cache/sync refactor, including its
first cleanup attempt: application **-52** lines. No dependency was added.
Main JS is 429.27 kB gzip versus 428.61 kB (+0.66 kB).
