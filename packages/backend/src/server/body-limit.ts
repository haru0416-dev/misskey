/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Buffer } from 'node:buffer';
import type { Context } from 'hono';

/**
 * リクエストボディを上限バイト数つきで読み切る。上限超過時は makeLimitError() の戻り値を throw する。
 *
 * Fastify 時代は bodyLimit (JSON API は 1 MiB) がグローバルに効いていたが、Hono の
 * `c.req.json()` / `c.req.formData()` は無制限にボディをメモリへ読むため、移行でこの保護が
 * 失われていた。content-length ヘッダは chunked 転送や虚偽申告で回避できるので、事前チェックに
 * 加えて実バイト数を数えながら読み、超過した時点で読み込みを打ち切る。
 */
export async function readRequestBodyWithLimit(c: Context, limit: number, makeLimitError: () => Error): Promise<Uint8Array> {
	const contentLength = Number(c.req.header('content-length'));
	if (Number.isFinite(contentLength) && contentLength > limit) {
		throw makeLimitError();
	}

	const body = c.req.raw.body;
	if (body == null) return new Uint8Array(0);

	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel().catch(() => {});
				throw makeLimitError();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	return Buffer.concat(chunks, total);
}
