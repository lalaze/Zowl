# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=:memory: \
    FILE_STORAGE_ROOT=/tmp/zemoney-build-storage
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Git does not track empty directories; the runner copies public/ regardless.
RUN mkdir -p public && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev \
    && rm -rf \
        node_modules/@next/swc-linux-*-musl \
        node_modules/@img/sharp-linuxmusl-* \
        node_modules/@img/sharp-libvips-linuxmusl-* \
        node_modules/@img/sharp-wasm32 \
    && npm cache clean --force

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    TMPDIR=/tmp \
    DATABASE_URL=/var/lib/zemoney/data/zemoney.sqlite \
    FILE_STORAGE_ROOT=/var/lib/zemoney/storage \
    ANDROID_RELEASE_ROOT=/var/lib/zemoney/releases/android
RUN apt-get -o Acquire::Retries=3 update \
    && apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/zemoney/data /var/lib/zemoney/storage \
    && chown -R node:node /var/lib/zemoney
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/drizzle ./drizzle
COPY --chown=node:node --from=builder /app/scripts ./scripts
COPY --chown=node:node --from=builder /app/src ./src
COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/next.config.ts /app/tsconfig.json ./
COPY docker/docker-entrypoint.sh /usr/local/bin/zemoney-entrypoint
RUN chmod 0755 /usr/local/bin/zemoney-entrypoint
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/zemoney-entrypoint"]
