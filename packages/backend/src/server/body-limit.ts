/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Buffer } from 'node:buffer';

/**
 * リクエストボディを上限バイト数つきで読み切る。上限超過時は makeLimitError() の戻り値を throw する。
 *
 * Hono の `c.req.json()` / `c.req.formData()` は無制限にボディをメモリへ読むため、上限は呼び出し側が
 * 用途ごとに渡す (JSON API / inbox / OAuth / ドライブアップロードで異なる)。content-length ヘッダは
 * chunked 転送や虚偽申告で回避できるので、事前チェックに加えて実バイト数を数えながら読み、
 * 超過した時点で読み込みを打ち切る。
 */
export async function readRequestBodyWithLimit(
	request: Request,
	limit: number,
	makeLimitError: () => Error,
): Promise<Uint8Array> {
	const hasTransferEncoding = request.headers.has('transfer-encoding');
	const contentLengthHeader = request.headers.get('content-length');
	const hasDecimalContentLength = contentLengthHeader != null && /^\d+$/.test(contentLengthHeader);
	const contentLength = hasDecimalContentLength ? Number(contentLengthHeader) : null;
	const hasSafeContentLength = contentLength != null && Number.isSafeInteger(contentLength);
	if (!hasTransferEncoding && hasDecimalContentLength) {
		if (!hasSafeContentLength || contentLength > limit) throw makeLimitError();
	}

	const body = request.body;
	if (body == null) return new Uint8Array(0);

	// Hono's bodyLimit middleware trusts the HTTP framing when Content-Length is present and
	// Transfer-Encoding is absent. Avoiding per-chunk Web Streams work is important for the
	// overwhelmingly common fixed-length JSON request. The post-read check preserves correctness
	// for direct Request callers whose declared and actual sizes differ.
	if (!hasTransferEncoding && hasSafeContentLength) {
		const raw = new Uint8Array(await request.arrayBuffer());
		if (raw.byteLength > limit) throw makeLimitError();
		return raw;
	}

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

	if (chunks.length === 0) return new Uint8Array(0);
	if (chunks.length === 1) return chunks[0] ?? new Uint8Array(0);
	return Buffer.concat(chunks, total);
}
