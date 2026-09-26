# Nevu Next Plex WebUI

Nevu Next Plex WebUI is a modern, self-hosted alternative web interface for Plex Media Server. It gives movie and TV libraries a faster, cleaner browser experience with Plex Home profiles, trailers, rich title details, multi-version playback, audio and subtitle selection, watchlists, recommendations, metadata editing, library sharing, and permission-aware original-file downloads. It runs in Docker and keeps Plex as the media server and source of truth.

![Nevu Next Plex WebUI showing a cinematic Plex home screen](assets/preview.jpg)

## Why this fork exists

I was not looking for another side project. I wanted to open Plex and watch a film.

The official web interface had become unreliable in my setup, while the alternatives I tried were either too bare, partially broken, or mixed the basic Plex experience with unrelated accounts, payments, and services. The original Nevu project was the closest match: it already had the right idea and a strong visual foundation, but login, mobile use, playback details, and several everyday workflows still needed work.

So yes, you are reading the README of a fork created because watching a film turned into debugging a media client. Nevu Next builds on the original project while focusing on a dependable Plex-native experience, practical administration tools, and a codebase that can keep moving forward.

This project is under active development. Expect rough edges, but also expect fixes to target real use rather than a mock interface.

Nevu Next is a modified fork of [Ipmake/NevuForPlex](https://github.com/Ipmake/NevuForPlex), maintained under [GPL-3.0](LICENSE) since 2026.

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
- **Optional native HTTPS** with mounted PEM files or a persistent self-signed certificate.
- **Self-hosted Docker deployment** with a reproducible image built from lockfiles.

Nevu Next currently targets Plex movie and TV libraries. It is not an official Plex product and is not affiliated with Plex, Inc.

## Installation

For a complete installation, use the ready Portainer Stack / Docker Compose example. If Plex already exists, the two Docker commands in the second example are enough. Both variants use the published multi-platform image from GitHub Container Registry.

For all supported environment variables, ports, persistent data, Plex connection options, and TLS mounts, see the [configuration reference](docs/configuration.md).

### Portainer Stack / Docker Compose: Plex + Nevu Next

Use this stack for a complete installation:

```yaml
name: nevu-next

services:
  plex:
    image: plexinc/pms-docker:latest
    restart: unless-stopped
    ports:
      - "32400:32400"
    environment:
      PLEX_CLAIM: claim-REPLACE_ME
      ADVERTISE_IP: http://192.168.1.10:32400/
    volumes:
      - /srv/plex/config:/config
      - /srv/media:/data:ro

  nevu-next:
    image: ghcr.io/dejniel/nevu-next-plex-webui:latest
    restart: unless-stopped
    depends_on:
      - plex
    ports:
      - "3000:3000"
    environment:
      PLEX_SERVER: http://plex:32400
    volumes:
      - nevu-data:/app/data

volumes:
  nevu-data:
```

Replace the server IP, storage paths, and `PLEX_CLAIM` from [plex.tv/claim](https://www.plex.tv/claim), then deploy:

```bash
docker compose up -d
```

Open Plex at `http://192.168.1.10:32400/web` and Nevu Next at `http://192.168.1.10:3000`. The claim token is only needed for Plex's first start.

Timezone, custom Plex user/group IDs, a dedicated `/transcode` mount, hardware acceleration, and additional Plex or Nevu discovery ports are optional and depend on the host. Add them only when your installation requires them.

### Docker commands: Nevu Next with an existing Plex server

When Plex is already running, pull the current Nevu Next image:

```bash
docker pull ghcr.io/dejniel/nevu-next-plex-webui:latest
```

Then start the container, replacing `PLEX_SERVER` with your server address:

```bash
docker run -d \
  --name nevu-next \
  --restart unless-stopped \
  -p 3000:3000 \
  -v nevu-next-data:/app/data \
  -e PLEX_SERVER=http://192.168.1.10:32400 \
  ghcr.io/dejniel/nevu-next-plex-webui:latest
```

`PLEX_SERVER` must include `http://` or `https://` and must not end with `/`. Open Nevu Next at `http://SERVER_IP:3000`.

### HTTPS

Nevu Next can use its persistent self-signed certificate or existing mounted PEM files. See the [HTTPS configuration](docs/configuration.md#https) for the exact environment variables and volume mounts.

## Contributing

Bug reports and focused pull requests are welcome. Before implementing a large behavioral or architectural change, [open an issue](https://github.com/Dejniel/Nevu-Next-Plex-WebUI/issues) so the direction and Plex API assumptions can be discussed first.

Good contributions should:

- Preserve compatibility with real Plex Media Server responses rather than relying only on mocked data.
- Include focused tests for authentication, permissions, metadata mutation, or playback-selection logic when those areas change.
- Keep the browser experience usable on both desktop and mobile layouts.
- Avoid committing Plex tokens, private server addresses, generated builds, or local database files.

Even a bug report with browser details, Plex server version, relevant logs, and exact reproduction steps is useful. Development can also be supported through [Buy Me a Coffee](https://buymeacoffee.com/dejniel).

## Development

Requires Node.js 22 and npm. Run the backend and frontend in separate terminals:

```bash
(cd backend && npm ci && npm run db:generate && npm run db:push && \
  PLEX_SERVER=http://192.168.1.10:32400 npm run dev)

(cd frontend && npm ci && npm start)
```

Checks:

```bash
(cd frontend && CI=true npm test -- --watchAll=false && npm run build)
(cd backend && npm run build)
docker build -t nevu-next:test .
```
