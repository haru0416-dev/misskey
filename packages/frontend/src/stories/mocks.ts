/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import type { SharedOptions } from 'msw';

export const onUnhandledRequest = ((req, print) => {
	const url = new URL(req.url);
	if (
		url.hostname !== 'localhost' ||
		// Vite の内部リクエストや静的資産は、未定義の API モックとして警告しない。
		/^\/(?:@|client-assets\/|fluent-emoji\/|iframe.html$|node_modules\/|src\/|sb-|static-assets\/|virtual:|vite\/)/.test(
			url.pathname,
		)
	) {
		return;
	}
	print.warning();
}) satisfies SharedOptions['onUnhandledRequest'];

export const commonHandlers = [
	// ログイン済みで動かすと preferences / persisted-state が起動時にレジストリを読む。
	http.all('/api/i/registry/get-all', () => HttpResponse.json({})),
	http.all('/api/i/registry/keys', () => HttpResponse.json([])),
	http.all('/api/i/registry/get', () => HttpResponse.json({ error: { code: 'NO_SUCH_KEY' } }, { status: 400 })),
	http.all('/api/i/registry/set', () => new HttpResponse(null, { status: 204 })),
	http.all(/\/api\/stats/, () => HttpResponse.json({ notesCount: 0, usersCount: 0, instances: 0 })),
	http.get('/fluent-emoji/:codepoints.png', async ({ params }) => {
		const { codepoints } = params;
		const value = await fetch(
			`https://unpkg.com/@misskey-dev/emoji-assets@17.0.3/built/fluent-emoji/${codepoints}.png`,
		).then((response) => response.blob());
		return new HttpResponse(value, {
			headers: {
				'Content-Type': 'image/png',
			},
		});
	}),
	http.get('/twemoji/:codepoints.svg', async ({ params }) => {
		const { codepoints } = params;
		const value = await fetch(
			`https://unpkg.com/@misskey-dev/emoji-assets@17.0.3/built/twemoji/${codepoints}.svg`,
		).then((response) => response.blob());
		return new HttpResponse(value, {
			headers: {
				'Content-Type': 'image/svg+xml',
			},
		});
	}),
];

/**
 * 一覧取得のモックがない場合は、paginator が扱える空配列を返す。
 * オブジェクトなどの実データが必要な story は独自のハンドラを定義する。
 *
 * commonHandlers に含めると独自ハンドラより先に一致するため、ハンドラ一覧の最後に置く。
 */
export const apiFallbackHandler = http.all(/\/api\//, () => HttpResponse.json([]));
