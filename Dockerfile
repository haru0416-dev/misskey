# syntax = docker/dockerfile:1.23

ARG BUN_VERSION=1.4.0

# build assets & compile TypeScript

FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-debian AS native-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	rm -f /etc/apt/apt.conf.d/docker-clean \
	; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
	&& apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /misskey

COPY --link ["bun.lock", "bunfig.toml", "package.json", "./"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/aiscript/package.json", "./packages/aiscript/"]
COPY --link ["packages/mfm-js/package.json", "./packages/mfm-js/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]
COPY --link ["packages/misskey-js/generator/package.json", "./packages/misskey-js/generator/"]
COPY --link ["scripts/changelog-checker/package.json", "./scripts/changelog-checker/"]

ARG NODE_ENV=production

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
	bun install --frozen-lockfile

COPY --link . ./

RUN bun run build \
	&& hardlink built/_frontend_vite_
RUN rm -rf .git/

# build native dependencies for target platform

FROM oven/bun:${BUN_VERSION}-debian AS target-builder

WORKDIR /misskey

COPY --link ["bun.lock", "bunfig.toml", "package.json", "./"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/aiscript/package.json", "./packages/aiscript/"]
COPY --link ["packages/mfm-js/package.json", "./packages/mfm-js/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]
COPY --link ["packages/misskey-js/generator/package.json", "./packages/misskey-js/generator/"]
COPY --link ["scripts/changelog-checker/package.json", "./scripts/changelog-checker/"]

ARG NODE_ENV=production

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
	bun install --frozen-lockfile --production --filter backend \
	&& rm -rf \
	node_modules/.bun/@img+sharp-libvips-linuxmusl-* \
	node_modules/.bun/@img+sharp-linuxmusl-* \
	node_modules/.bun/@napi-rs+canvas-linux-*-musl@* \
	node_modules/.bun/slacc-linux-*-musl@*

FROM oven/bun:${BUN_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	apt-get update \
	&& apt-get install -y --no-install-recommends \
	ffmpeg tini libjemalloc2 \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
	&& groupadd -g "${GID}" misskey \
	&& useradd -l -u "${UID}" -g "${GID}" -m -d /misskey misskey \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /u+s -ignore_readdir_race -exec chmod u-s {} \; \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /g+s -ignore_readdir_race -exec chmod g-s {} \; \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists

USER misskey
WORKDIR /misskey

COPY --chown=misskey:misskey --from=target-builder /misskey/node_modules ./node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/backend/node_modules ./packages/backend/node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-js/node_modules ./packages/misskey-js/node_modules
COPY --chown=misskey:misskey --from=native-builder /misskey/built ./built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-js/built ./packages/misskey-js/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/built ./packages/backend/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/i18n/built ./packages/i18n/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/mfm-js/built ./packages/mfm-js/built
COPY --chown=misskey:misskey --from=native-builder /misskey/package.json ./package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/package.json ./packages/backend/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/i18n/package.json ./packages/i18n/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/mfm-js/package.json ./packages/mfm-js/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-js/package.json ./packages/misskey-js/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/scripts/compile_config.js ./packages/backend/scripts/compile_config.js
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/scripts/check_connect.js ./packages/backend/scripts/check_connect.js
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/migration/*.sql ./packages/backend/migration/
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/migration/meta/_journal.json ./packages/backend/migration/meta/_journal.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/assets ./packages/backend/assets
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/src/server/assets ./packages/backend/src/server/assets
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/frontend/assets ./packages/frontend/assets
COPY --chown=misskey:misskey --from=native-builder /misskey/deploy/healthcheck.sh ./deploy/healthcheck.sh

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV NODE_ENV=production
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD ["/bin/bash", "/misskey/deploy/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "run", "migrateandstart"]
