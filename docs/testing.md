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

Ports are configurable through `PLEX_TEST_PORT` and `NEVU_TEST_PORT`.
For a remote host, forward the localhost ports through an SSH tunnel.
Use `PLEX_TEST_IMAGE` to select a Plex version and record it with test results.
Authentication and online metadata features still use Plex services.

Stop with `docker compose -f compose.test.yaml down`. Adding `-v` resets the
test stack's volumes; sample media remains in the host directory.
