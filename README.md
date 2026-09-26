# Nevu Next Plex WebUI

Nevu Next Plex WebUI is a modern, self-hosted alternative web interface for Plex Media Server. It gives movie and TV libraries a faster, cleaner browser experience with Plex Home profiles, trailers, rich title details, multi-version playback, audio and subtitle selection, watchlists, recommendations, metadata editing, library sharing, and permission-aware original-file downloads. It runs in Docker and keeps Plex as the media server and source of truth.

[Repository](https://github.com/Dejniel/Nevu-Next-Plex-WebUI) | [Report an issue](https://github.com/Dejniel/Nevu-Next-Plex-WebUI/issues) | [Support development](https://buymeacoffee.com/dejniel)

![Nevu Next Plex WebUI showing a cinematic Plex home screen](assets/screenshot1.png)

## Why this fork exists

I was not looking for another side project. I wanted to open Plex and watch a film.

The official web interface had become unreliable in my setup, while the alternatives I tried were either too bare, partially broken, or mixed the basic Plex experience with unrelated accounts, payments, and services. The original Nevu project was the closest match: it already had the right idea and a strong visual foundation, but login, mobile use, playback details, and several everyday workflows still needed work.

So yes, you are reading the README of a fork created because watching a film turned into debugging a media client. Nevu Next builds on the original project while focusing on a dependable Plex-native experience, practical administration tools, and a codebase that can keep moving forward.

This project is under active development. Expect rough edges, but also expect fixes to target real use rather than a mock interface.

## Features

- **A cinematic, responsive Plex interface** for desktop and mobile browsers.
- **Plex-native authentication** with Plex Home profile selection, protected-profile PIN entry, and optional profile remembering.
- **Movie and TV browsing** with search, Continue Watching, watchlists, library rows, and recommendations.
- **Richer title pages** with trailers, ratings, reviews, cast, related titles, extras, media details, and technical information.
- **Integrated playback** with quality selection, automatic audio and subtitle matching, seek previews, intro skipping, and resume support.
- **Multiple media versions** with combined audio and subtitle lists; choosing a track automatically switches to the file that contains it.
- **Firefox-compatible trailer playback** with Plex Discover fallback when a local trailer is unavailable.
- **Plex Home and administration tools** for basic metadata editing and sharing libraries with Plex users.
- **Original-file downloads** when the active Plex account is allowed to download media.
- **Watch Together through Nevu Sync**, which can be disabled for a simpler local installation.
- **Self-hosted Docker deployment** with a reproducible image built from lockfiles.

Nevu Next currently targets Plex movie and TV libraries. It is not an official Plex product and is not affiliated with Plex, Inc.

## Installation

Docker Engine with the Compose plugin is the recommended way to run Nevu Next. Node.js is only required for local development.

### Plex and Nevu Next together

Use this option for a new server where Plex and Nevu Next should run in the same Docker Compose project.

1. Clone the repository and enter it:

   ```bash
   git clone https://github.com/Dejniel/Nevu-Next-Plex-WebUI.git
   cd Nevu-Next-Plex-WebUI
   ```

2. Create the environment file:

   ```bash
   cp .env.plex.example .env
   ```

3. Edit `.env` and set at least:

   - `SERVER_IP` to the LAN address of the Docker host.
   - `PLEX_MEDIA_PATH` to the host directory containing your media.
   - `PLEX_CLAIM` to a fresh token from [plex.tv/claim](https://www.plex.tv/claim) for the first start.
   - `PLEX_UID` and `PLEX_GID` to the user and group that can read your media. Run `id` to find them.

4. Build and start both services:

   ```bash
   docker compose -f compose.plex.yaml up -d --build
   ```

5. Open Plex at `http://SERVER_IP:32400/web`, finish its first-run setup, then open Nevu Next at `http://SERVER_IP:3000`.

Plex configuration is stored in `./data/plex`, transcode data in `./data/transcode`, and Nevu Next state in the `nevu-data` Docker volume. The media directory is mounted read-only. After Plex is claimed successfully, `PLEX_CLAIM` is no longer needed. The bundled Nevu backend waits for Plex if Plex takes longer to start.

The all-in-one file uses the official [`plexinc/pms-docker`](https://github.com/plexinc/pms-docker) image in bridge mode. Pin `PLEX_IMAGE` to a tested version instead of `latest` if you prefer controlled Plex upgrades. Intel Quick Sync users can uncomment the `/dev/dri` device mapping in `compose.plex.yaml` and enable hardware acceleration in Plex.

### Connect to an existing Plex server

Use the smaller default Compose project when Plex already runs on this host or elsewhere on the network:

```bash
git clone https://github.com/Dejniel/Nevu-Next-Plex-WebUI.git
cd Nevu-Next-Plex-WebUI
cp .env.example .env
```

Set `PLEX_SERVER` in `.env`. The URL must include `http://` or `https://` and must not end with `/`.

```dotenv
PLEX_SERVER=http://192.168.1.10:32400
```

Then build and start Nevu Next:

```bash
docker compose up -d --build
```

For Plex running directly on the same Linux Docker host, the default `http://host.docker.internal:32400` works through the included host-gateway mapping.

### Updating

```bash
git pull --ff-only
docker compose up -d --build
```

For the combined stack, add `-f compose.plex.yaml` to the Compose command. Review changes before updating a server you depend on, especially changes to Plex image versions or persistent-volume paths.

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PLEX_SERVER` | none | Plex base URL for the standalone Nevu Compose setup; no trailing slash. |
| `NEVU_PORT` | `3000` | TCP port exposed for the Nevu Next web interface. |
| `NEVU_DISCOVERY_PORT` | `44201` | UDP port used for Nevu discovery. |
| `NEVU_IMAGE` | `local/nevu:dev` | Local image name assigned by Compose. |
| `DISABLE_TLS_VERIFY` | `false` | Disable certificate verification between Nevu and Plex. Use only for a trusted self-signed server. |
| `DISABLE_NEVU_SYNC` | `false` | Disable Watch Together / Nevu Sync. |
| `DISABLE_REQUEST_LOGGING` | `false` | Disable backend request logging. |
| `DISABLE_GLOBAL_REVIEWS` | `false` | Disable Nevu community reviews. |
| `LISTEN_PORT` | `3000` | Internal backend listening port; normally leave unchanged in Docker. |
| `PORT` | `3000` | Public port announced by Nevu discovery; Compose sets it from `NEVU_PORT`. |

The combined Plex stack also uses the variables documented in `.env.plex.example` for media, configuration, timezone, ownership, claim token, and advertised server address.

## Contributing

Bug reports and focused pull requests are welcome. Before implementing a large behavioral or architectural change, [open an issue](https://github.com/Dejniel/Nevu-Next-Plex-WebUI/issues) so the direction and Plex API assumptions can be discussed first.

Good contributions should:

- Preserve compatibility with real Plex Media Server responses rather than relying only on mocked data.
- Include focused tests for authentication, permissions, metadata mutation, or playback-selection logic when those areas change.
- Keep the browser experience usable on both desktop and mobile layouts.
- Avoid committing Plex tokens, private server addresses, generated builds, or local database files.

Even a bug report with browser details, Plex server version, relevant logs, and exact reproduction steps is useful. Development can also be supported through [Buy Me a Coffee](https://buymeacoffee.com/dejniel).

## Development

Development uses Node.js 22 and npm. The frontend runs on port `4000`; the backend runs on port `3000` and proxies requests to Plex.

Install and start the backend:

```bash
cd backend
npm ci
npm run db:generate
npm run db:push
PLEX_SERVER=http://192.168.1.10:32400 npm run dev
```

In a second terminal, install and start the frontend:

```bash
cd frontend
npm ci
npm start
```

Open `http://localhost:4000`.

Run the frontend test suite and production build before submitting a change:

```bash
cd frontend
CI=true npm test -- --watchAll=false
npm run build
```

Validate the backend and full container image when backend or deployment code changes:

```bash
cd backend
npm run build

cd ..
docker build -t nevu-next:test .
```

## Project history and license

Nevu Next Plex WebUI is a fork of [Ipmake/NevuForPlex](https://github.com/Ipmake/NevuForPlex). The original project established the interface, Plex integration, and playback foundation this fork continues to develop.

The project is distributed under the [GNU General Public License v3.0](LICENSE).
