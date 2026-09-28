/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 本番バンドルで外に残し、実行時に node_modules から読むもの。rolldown.config.ts のバンドル設定と、
// Docker イメージで実行時に要る依存だけを残す刈り込み (scripts/prune-runtime-modules.mjs) が同じ一覧を使う。
export const externalModules = [
	// slacc 本体もバンドルしない。napi-rs のローダーは `slacc-linux-x64-gnu` 等を
	// 自分の位置から require するため、バンドルへ取り込むと解決の起点が built/ になり、
	// isolated リンカ (bunfig.toml) がストア配下にしか置かないネイティブパッケージを見つけられない。
	'slacc',
	/^slacc-.*/,
	/^@opentelemetry\/.*/,
	/^@napi-rs\/.*/,
	// `drizzle-orm/bun-sql` が `import { SQL } from 'bun'` を含む。bunランタイム組み込みなので解決させない
	'bun',
	'bullmq',
	'ioredis',
	'sharp',
	'ipaddr.js',
	'file-type',
];

// import ではなくファイルパスで直接読むもの (static-assets が絵文字画像を配信する)。
export const pathLoadedModules = ['@misskey-dev/emoji-assets'];
