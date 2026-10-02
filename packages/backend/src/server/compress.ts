/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Context } from 'hono';
import { parseAccept } from 'hono/utils/accept';

// app.ts の hono/compress のデフォルトと同じ下限。
const MINIMUM_BYTES = 1024;
// これ以下は同期で圧縮する。同期の圧縮は終わるまで他の処理を止めるので、大きい応答 (1 万件の絵文字一覧で
// 約 2.3MB・8ms) は hono/compress のストリーム経路に任せる。
const MAXIMUM_SYNC_BYTES = 1024 * 1024;
// hono/compress の CompressionStream と同じレベルで、出力の大きさは変わらない。
const GZIP_LEVEL = 6;

/** hono/compress と同じ規則で gzip / deflate から選ぶ。 */
function selectEncoding(header: string | undefined): 'gzip' | 'deflate' | undefined {
	if (header === undefined) {
		return undefined;
	}
	const accepts = parseAccept(header);
	const wildcardQ = accepts.find((accept) => accept.type === '*')?.q;
	let best: { encoding: 'gzip' | 'deflate'; q: number } | undefined;
	for (const encoding of ['gzip', 'deflate'] as const) {
		const explicit = accepts.find((accept) => accept.type.toLowerCase() === encoding);
		const q = explicit ? explicit.q : (wildcardQ ?? 0);
		if (q === 1) {
			return encoding;
		}
		if (q > 0 && (best == null || q > best.q)) {
			best = { encoding, q };
		}
	}
	return best?.encoding;
}

/**
 * API の JSON 本文を、手元のバイト列のまま同期で gzip する。hono/compress の CompressionStream は 1 件ごとの
 * 準備が重く、実際の API 応答 (1〜36KB) で同期圧縮の 2〜4 倍の CPU を使っていた (混合負荷でアプリ CPU の約 13%)。
 * 圧縮しないとき (gzip を受け付けない・小さい・大きい・HEAD) は null を返し、判断を hono/compress に任せる。
 * 本文がストリームの応答はここを通さない (読み切ると途中の失敗が接続断ではなくエラー応答になる)。
 */
export function gzipApiBody(c: Context, bytes: Uint8Array): Uint8Array | null {
	if (
		bytes.byteLength < MINIMUM_BYTES ||
		bytes.byteLength > MAXIMUM_SYNC_BYTES ||
		c.req.method === 'HEAD' ||
		selectEncoding(c.req.header('Accept-Encoding')) !== 'gzip'
	) {
		return null;
	}
	return Bun!.gzipSync(bytes, { level: GZIP_LEVEL });
}
