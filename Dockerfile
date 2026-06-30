# syntax = docker/dockerfile:1.23

ARG BUN_VERSION=1.3.14

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
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/frontend-builder/package.json", "./packages/frontend-builder/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/aiscript-languageserver-stub/package.json", "./packages/aiscript-languageserver-stub/"]
COPY --link ["packages/re2-stub/package.json", "./packages/re2-stub/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]
COPY --link ["packages/misskey-js/generator/package.json", "./packages/misskey-js/generator/"]
COPY --link ["packages/misskey-reversi/package.json", "./packages/misskey-reversi/"]
COPY --link ["packages/misskey-bubble-game/package.json", "./packages/misskey-bubble-game/"]
COPY --link ["scripts/changelog-checker/package.json", "./scripts/changelog-checker/"]

ARG NODE_ENV=production

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
	bun install --frozen-lockfile

COPY --link . ./

RUN git submodule update --init
RUN bun run build
RUN rm -rf .git/

# build native dependencies for target platform

FROM --platform=$TARGETPLATFORM oven/bun:${BUN_VERSION}-debian AS target-builder

RUN apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential

WORKDIR /misskey

COPY --link ["bun.lock", "bunfig.toml", "package.json", "./"]
COPY --link ["scripts", "./scripts"]
COPY --link ["patches", "./patches"]
COPY --link ["packages/backend/package.json", "./packages/backend/"]
COPY --link ["packages/frontend-shared/package.json", "./packages/frontend-shared/"]
COPY --link ["packages/frontend/package.json", "./packages/frontend/"]
COPY --link ["packages/frontend-embed/package.json", "./packages/frontend-embed/"]
COPY --link ["packages/frontend-builder/package.json", "./packages/frontend-builder/"]
COPY --link ["packages/i18n/package.json", "./packages/i18n/"]
COPY --link ["packages/icons-subsetter/package.json", "./packages/icons-subsetter/"]
COPY --link ["packages/aiscript-languageserver-stub/package.json", "./packages/aiscript-languageserver-stub/"]
COPY --link ["packages/re2-stub/package.json", "./packages/re2-stub/"]
COPY --link ["packages/sw/package.json", "./packages/sw/"]
COPY --link ["packages/misskey-js/package.json", "./packages/misskey-js/"]
COPY --link ["packages/misskey-js/generator/package.json", "./packages/misskey-js/generator/"]
COPY --link ["packages/misskey-reversi/package.json", "./packages/misskey-reversi/"]
COPY --link ["packages/misskey-bubble-game/package.json", "./packages/misskey-bubble-game/"]
COPY --link ["scripts/changelog-checker/package.json", "./scripts/changelog-checker/"]

ARG NODE_ENV=production

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
	bun install --frozen-lockfile --production

FROM --platform=$TARGETPLATFORM oven/bun:${BUN_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	ffmpeg tini curl libjemalloc-dev libjemalloc2 \
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
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-reversi/node_modules ./packages/misskey-reversi/node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-bubble-game/node_modules ./packages/misskey-bubble-game/node_modules
COPY --chown=misskey:misskey --from=native-builder /misskey/built ./built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-js/built ./packages/misskey-js/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-reversi/built ./packages/misskey-reversi/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-bubble-game/built ./packages/misskey-bubble-game/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/built ./packages/backend/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/i18n/built ./packages/i18n/built
COPY --chown=misskey:misskey . ./

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENV NODE_ENV=production
HEALTHCHECK --interval=5s --retries=20 CMD ["/bin/bash", "/misskey/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "run", "migrateandstart"]
