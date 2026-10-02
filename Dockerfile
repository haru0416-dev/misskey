# syntax = docker/dockerfile:1.23

ARG BUN_VERSION=1.4.2

FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-debian AS native-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	rm -f /etc/apt/apt.conf.d/docker-clean \
	; echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
	&& apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential curl \
	&& curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable

WORKDIR /misskey

COPY --link ["bun.lock", "bunfig.toml", "package.json", "./"]
COPY --link ["packages/slacc/package.json", "./packages/slacc/"]
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

# napi の型定義置換が既存レイヤーのファイルを ESTALE と判定するため、同じ RUN 内で書き込みレイヤーへ移す。
RUN . "$HOME/.cargo/env" \
	&& touch packages/slacc/index.d.ts \
	&& bun run build \
	&& hardlink built/_frontend_vite_
RUN rm -rf .git/

FROM oven/bun:${BUN_VERSION}-debian AS target-builder

WORKDIR /misskey

COPY --link ["bun.lock", "bunfig.toml", "package.json", "./"]
COPY --link ["packages/slacc/package.json", "./packages/slacc/"]
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
	bun install --frozen-lockfile --production --filter backend

# 実行時に読む依存は runtime-externals.mjs とその依存に限る。刈り込み後も全依存が解決できることを検査する。
# glibc 環境では不要な sharp の musl 版は、任意依存として残るため別に削除する。
COPY --link ["packages/backend/runtime-externals.mjs", "./packages/backend/"]
COPY --link ["packages/backend/scripts/prune-runtime-modules.mjs", "./packages/backend/scripts/"]
RUN bun packages/backend/scripts/prune-runtime-modules.mjs /misskey \
	&& rm -rf \
	node_modules/.bun/@img+sharp-libvips-linuxmusl-* \
	node_modules/.bun/@img+sharp-linuxmusl-*

# slacc はリポジトリ内でビルドするので、ターゲットの実行環境向けに別の段で作り、成果物 (.node) だけを渡す。
# 実行時の依存を入れる段で作ると、ビルド用の依存 (@napi-rs/cli や typescript) が実行用イメージに混ざる。
FROM oven/bun:${BUN_VERSION}-debian AS slacc-builder

WORKDIR /misskey

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	apt-get update \
	&& apt-get install -yqq --no-install-recommends build-essential curl \
	&& curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable

COPY --link ["bun.lock", "bunfig.toml", "package.json", "./"]
COPY --link ["packages/slacc/package.json", "./packages/slacc/"]
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

COPY --link ["packages/slacc", "./packages/slacc/"]

# 型定義を先に書き込みレイヤーへ移し、napi の置換時の ESTALE を避ける。
RUN --mount=type=cache,target=/root/.cargo/registry,sharing=locked \
	--mount=type=cache,target=/misskey/packages/slacc/target,sharing=locked \
	. "$HOME/.cargo/env" \
	&& bun install --frozen-lockfile --filter slacc \
	&& touch packages/slacc/index.d.ts \
	&& bun run --filter slacc build

# ffmpeg/ffprobe は動画のメタデータ取得・サムネイル・フレーム抽出に必要な部品だけを有効にする。
# blackframe が GPL 対象なので --enable-gpl を指定し、実行用イメージにもライセンスとソースの所在を含める。
FROM oven/bun:${BUN_VERSION}-debian AS ffmpeg-builder

ARG FFMPEG_VERSION=7.1.5
# https://ffmpeg.org/releases/ の署名を FFmpeg release signing key
# (FCF9 86EA 15E6 E293 A564 4F10 B432 2F04 D676 58D8) で検証したうえで固定した値。
ARG FFMPEG_SHA256=de668509caf9e35e3cd162473441fdb29538c6d96ed080292b3cf9e6fc5d558f

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	apt-get update \
	&& apt-get install -yqq --no-install-recommends \
	build-essential nasm pkg-config libdav1d-dev zlib1g-dev xz-utils curl ca-certificates

WORKDIR /src
RUN curl --proto '=https' --tlsv1.2 -fsSLO "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
	&& echo "${FFMPEG_SHA256}  ffmpeg-${FFMPEG_VERSION}.tar.xz" | sha256sum -c - \
	&& tar xf "ffmpeg-${FFMPEG_VERSION}.tar.xz"

WORKDIR /src/ffmpeg-${FFMPEG_VERSION}
RUN ./configure \
	--prefix=/opt/ffmpeg \
	--disable-everything --disable-autodetect \
	--disable-debug --disable-doc --disable-ffplay --disable-network \
	--enable-gpl --enable-zlib --enable-libdav1d \
	--enable-protocol=file,pipe \
	--enable-demuxer=mov,matroska,avi,mpegts,mpegps,flv,ogg,asf,apng,gif,mp3,aac,wav,flac,m4v,h264,hevc,mjpeg \
	--enable-decoder=h264,hevc,vp8,vp9,libdav1d,mpeg4,h263,mjpeg,mpeg1video,mpeg2video,theora,prores,png,apng,gif,wmv1,wmv2,wmv3,vc1,msmpeg4v1,msmpeg4v2,msmpeg4v3,aac,mp3,opus,vorbis,flac,pcm_s16le,pcm_s24le,pcm_f32le \
	--enable-parser=h264,hevc,vp8,vp9,av1,mpeg4video,mpegvideo,mjpeg,png,gif,aac,opus,vorbis,mpegaudio,flac,h263,vc1 \
	--enable-bsf=vp9_superframe_split,av1_frame_split,h264_mp4toannexb,hevc_mp4toannexb,extract_extradata \
	--enable-encoder=png \
	--enable-muxer=image2 \
	--enable-filter=select,blackframe,metadata,scale,format,null \
	&& make -j"$(nproc)" \
	&& make install \
	&& strip /opt/ffmpeg/bin/ffmpeg /opt/ffmpeg/bin/ffprobe \
	&& mkdir -p /opt/ffmpeg/licenses \
	&& cp LICENSE.md COPYING.GPLv2 /opt/ffmpeg/licenses/ \
	&& printf 'FFmpeg %s, built from https://ffmpeg.org/releases/ffmpeg-%s.tar.xz (sha256 %s).\nThe build configuration is the ffmpeg-builder stage of the Dockerfile in the Toneriko source repository.\n' \
	"${FFMPEG_VERSION}" "${FFMPEG_VERSION}" "${FFMPEG_SHA256}" > /opt/ffmpeg/licenses/SOURCE.txt

# 指定した部品が黙って外れていないか確かめる (ライセンスや依存の不足で configure が落とすことがある)。
RUN F=/opt/ffmpeg/bin/ffmpeg; missing=""; \
	for x in select blackframe metadata scale format; do $F -hide_banner -filters 2>/dev/null | grep -qE "^ [.A-Z|]+ $x " || missing="$missing filter:$x"; done; \
	for x in h264 hevc vp8 vp9 libdav1d mpeg4 mjpeg prores png apng gif theora; do $F -hide_banner -decoders 2>/dev/null | grep -qE "^ [.A-Z]+ $x " || missing="$missing decoder:$x"; done; \
	for x in mov,mp4,m4a,3gp,3g2,mj2 matroska,webm avi apng ogg; do $F -hide_banner -demuxers 2>/dev/null | grep -qE "^ +D +$x " || missing="$missing demuxer:$x"; done; \
	$F -hide_banner -encoders 2>/dev/null | grep -qE "^ [.A-Z]+ png " || missing="$missing encoder:png"; \
	$F -hide_banner -muxers 2>/dev/null | grep -qE "^ +E +image2 " || missing="$missing muxer:image2"; \
	if [ -n "$missing" ]; then echo "ffmpeg is missing:$missing"; exit 1; fi

FROM oven/bun:${BUN_VERSION}-slim AS runner

ARG UID="991"
ARG GID="991"

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
	--mount=type=cache,target=/var/lib/apt,sharing=locked \
	apt-get update \
	&& apt-get install -y --no-install-recommends \
	libdav1d7 tini libjemalloc2 \
	&& ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
	&& groupadd -g "${GID}" misskey \
	&& useradd -l -u "${UID}" -g "${GID}" -m -d /misskey misskey \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /u+s -ignore_readdir_race -exec chmod u-s {} \; \
	&& find / -type d -path /sys -prune -o -type d -path /proc -prune -o -type f -perm /g+s -ignore_readdir_race -exec chmod g-s {} \; \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists

USER misskey
WORKDIR /misskey

# ドライブの保存先。イメージに無いと、名前付きボリュームを付けたとき Docker が root 所有で作り、アップロードが EACCES で全て失敗する。
# ここで misskey 所有にしておけば、新しいボリュームは作成時にこの所有者と権限を引き継ぐ。
RUN mkdir -p /misskey/files

COPY --chown=misskey:misskey --from=target-builder /misskey/node_modules ./node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/backend/node_modules ./packages/backend/node_modules
COPY --chown=misskey:misskey --from=target-builder /misskey/packages/misskey-js/node_modules ./packages/misskey-js/node_modules
COPY --chown=misskey:misskey --from=slacc-builder ["/misskey/packages/slacc/package.json", "/misskey/packages/slacc/index.cjs", "/misskey/packages/slacc/index.mjs", "/misskey/packages/slacc/index.d.ts", "./packages/slacc/"]
COPY --chown=misskey:misskey --from=slacc-builder /misskey/packages/slacc/*.node ./packages/slacc/
COPY --chown=misskey:misskey --from=native-builder /misskey/built ./built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/icons-subsetter/vendor/tabler-icons/LICENSE ./licenses/tabler-icons.txt
# 自前で組んだ ffmpeg (GPL) と、そのライセンス・ソースの所在。libdav1d7 は AV1 のデコードに要る。
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffmpeg /opt/ffmpeg/bin/ffprobe /usr/local/bin/
COPY --chown=misskey:misskey --from=ffmpeg-builder /opt/ffmpeg/licenses ./licenses/ffmpeg
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-js/built ./packages/misskey-js/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/built ./packages/backend/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/i18n/built ./packages/i18n/built
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/mfm-js/built ./packages/mfm-js/built
COPY --chown=misskey:misskey --from=native-builder /misskey/package.json ./package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/package.json ./packages/backend/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/i18n/package.json ./packages/i18n/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/mfm-js/package.json ./packages/mfm-js/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/misskey-js/package.json ./packages/misskey-js/package.json
COPY --chown=misskey:misskey --from=native-builder /misskey/packages/backend/scripts/compile-config.js ./packages/backend/scripts/compile-config.js
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
