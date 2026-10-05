# Configuration

Nevu Next is configured through container ports, one persistent data volume, and environment variables. `PLEX_SERVER` is the only required variable.

## Ports and persistent data

| Container path or port | Required | Purpose |
| --- | --- | --- |
| `3000/tcp` | Yes | Web interface and API. Map a host port to this port unless `LISTEN_PORT` is changed. |
| `/app/data` | Recommended | Stores the Nevu database and generated self-signed TLS certificate. Mount a volume to preserve them across container replacement. |

The standard mappings are:

```yaml
ports:
  - "3000:3000"
volumes:
  - nevu-data:/app/data
```

## Environment variables

Boolean options are enabled only when their value is the string `"true"`.

| Variable | Default | Description |
| --- | --- | --- |
| `PLEX_SERVER` | Required | Plex Media Server URL, including `http://` or `https://` and without a trailing slash. For example, `http://plex:32400` or `http://192.168.1.10:32400`. |
| `LISTEN_PORT` | `3000` | Internal TCP port on which Nevu listens. The container-side port mapping and healthcheck use this value. |
| `DATABASE_URL` | `file:./data/perplexed.db` | Local SQLite file. Relative paths resolve from the backend directory (`/app` in Docker); keep custom paths on persistent storage. |
| `DISABLE_TLS_VERIFY` | `false` | Accept an untrusted HTTPS certificate presented by `PLEX_SERVER`. This affects the Nevu-to-Plex connection, not Nevu's own certificate. |
| `DISABLE_NEVU_SYNC` | `false` | Disable Nevu Sync and its Watch Together interface. |
| `DISABLE_REQUEST_LOGGING` | `false` | Stop logging HTTP requests to the container log. Dynamic image requests are always omitted and sensitive query tokens are redacted. Startup and error messages remain enabled. |
| `TLS_SELF_SIGNED` | `false` | Generate and persist a self-signed certificate, then serve Nevu over HTTPS. |
| `TLS_COMMON_NAME` | `localhost` | Certificate common name used only with `TLS_SELF_SIGNED=true`. |
| `TLS_SUBJECT_ALT_NAME` | `DNS:<TLS_COMMON_NAME>` | Certificate subject alternative name used only with `TLS_SELF_SIGNED=true`, for example `IP:192.168.1.10`. |
| `TLS_CERT_PATH` | None | Path inside the container to a PEM certificate or certificate chain. Must be configured together with `TLS_KEY_PATH`. |
| `TLS_KEY_PATH` | None | Path inside the container to the certificate's PEM private key. Must be configured together with `TLS_CERT_PATH`. |
| `TLS_KEY_PASSPHRASE` | None | Passphrase for an encrypted private key mounted through `TLS_KEY_PATH`. |


The database stores only interface preferences per Plex profile. Existing
`UserOption` data remains readable; retired review tables are unused and are
not automatically deleted. There is no runtime schema migration.

Local development also loads `backend/.env`; existing environment variables take precedence.

## Connecting to Plex

When Plex and Nevu are services in the same Compose stack, use the Plex service name and its container port:

```yaml
environment:
  PLEX_SERVER: http://plex:32400
```

When Plex runs elsewhere on the LAN, use an address reachable from inside the Nevu container:

```yaml
environment:
  PLEX_SERVER: http://192.168.1.10:32400
```

For a Plex server using an untrusted HTTPS certificate:

```yaml
environment:
  PLEX_SERVER: https://192.168.1.10:32400
  DISABLE_TLS_VERIFY: "true"
```

Do not add a trailing slash to `PLEX_SERVER`.

## Published port

The left side of a Compose port mapping is the port opened on the host:

```yaml
ports:
  - "8080:3000"
environment:
  PLEX_SERVER: http://plex:32400
```

Changing `LISTEN_PORT` is normally unnecessary. If it is changed, update the container side of the TCP mapping as well:

```yaml
ports:
  - "8080:8080"
environment:
  PLEX_SERVER: http://plex:32400
  LISTEN_PORT: "8080"
```

## HTTPS

### Persistent self-signed certificate

Keep `/app/data` mounted so the generated certificate survives container replacement:

```yaml
services:
  nevu-next:
    image: ghcr.io/dejniel/nevu-next-plex-webui:latest
    ports:
      - "3000:3000"
    environment:
      PLEX_SERVER: http://plex:32400
      TLS_SELF_SIGNED: "true"
      TLS_COMMON_NAME: 192.168.1.10
      TLS_SUBJECT_ALT_NAME: IP:192.168.1.10
    volumes:
      - nevu-data:/app/data

volumes:
  nevu-data:
```

Open Nevu at `https://192.168.1.10:3000` and accept the certificate in the client where appropriate.

### Existing PEM certificate

Mount the existing certificate chain and matching private key as read-only files, then point Nevu to their paths inside the container:

```yaml
services:
  nevu-next:
    image: ghcr.io/dejniel/nevu-next-plex-webui:latest
    ports:
      - "3000:3000"
    environment:
      PLEX_SERVER: http://plex:32400
      TLS_CERT_PATH: /run/nevu-tls/fullchain.pem
      TLS_KEY_PATH: /run/nevu-tls/privkey.pem
    volumes:
      - nevu-data:/app/data
      - /srv/certificates/fullchain.pem:/run/nevu-tls/fullchain.pem:ro
      - /srv/certificates/privkey.pem:/run/nevu-tls/privkey.pem:ro

volumes:
  nevu-data:
```

Both files must be PEM encoded and readable by the container. For an encrypted private key, also set `TLS_KEY_PASSPHRASE`. The hostname or IP used in the browser must be covered by the mounted certificate.

## Complete Nevu service

This example includes persistent data and optional LAN discovery while leaving HTTPS disabled:

```yaml
services:
  nevu-next:
    image: ghcr.io/dejniel/nevu-next-plex-webui:latest
    container_name: nevu-next
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PLEX_SERVER: http://192.168.1.10:32400
    volumes:
      - nevu-data:/app/data

volumes:
  nevu-data:
```
