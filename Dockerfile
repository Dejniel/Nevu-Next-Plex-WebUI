ARG NODE_IMAGE=node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2
ARG APP_VERSION=dev

FROM ${NODE_IMAGE} AS node-base
RUN npm install --global npm@12.2.0 && npm cache clean --force

FROM node-base AS frontend-build
ARG APP_VERSION
WORKDIR /build
COPY contracts/ ./contracts/
WORKDIR /build/frontend
ENV CI=true \
    VITE_APP_VERSION=${APP_VERSION}

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run typecheck && npm run build

FROM node-base AS backend-base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl openssl tini \
    && rm -rf /var/lib/apt/lists/*

FROM backend-base AS backend-build
WORKDIR /build
COPY contracts/ ./contracts/
WORKDIR /build/backend

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ ./prisma/
RUN npm ci
COPY backend/ ./
RUN npm run db:generate && npm run build

FROM backend-base AS runtime
ARG APP_VERSION
WORKDIR /
COPY contracts/ ./contracts/
WORKDIR /app
ENV NODE_ENV=production \
    LISTEN_PORT=3000 \
    APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.source="https://github.com/Dejniel/Nevu-Next-Plex-WebUI" \
      org.opencontainers.image.title="Nevu Next Plex WebUI" \
      org.opencontainers.image.licenses="GPL-3.0"

COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma/ ./prisma/
RUN npm ci --omit=dev \
    && npm run db:generate \
    && npm cache clean --force

COPY --from=backend-build /build/backend/dist/ ./dist/
COPY --from=frontend-build /build/frontend/build/ ./www/
COPY backend/run.sh ./run.sh
RUN chmod +x ./run.sh

EXPOSE 3000
EXPOSE 44201/udp
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD scheme=http; \
        if [ "${TLS_SELF_SIGNED:-false}" = "true" ] || [ -n "${TLS_CERT_PATH:-}" ]; then scheme=https; fi; \
        curl --insecure --fail --silent "${scheme}://127.0.0.1:${LISTEN_PORT}/status" | grep --quiet '"ready":true' || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./run.sh"]
