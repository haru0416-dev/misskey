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
		// setupWorker を直接起動するため、addon の initialize() が除外する `@vite/` 等をここで除外する。
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
 * どの story にも拾われなかった API 呼び出しの受け皿。
 *
 * 実サーバーへ抜けると 404 の空応答で misskeyApi の `res.json()` が未捕捉の SyntaxError になり、
 * テスト全体が落ちる。書き忘れの大半は一覧取得で、`{}` だと paginator が `items is not iterable`
 * で落ちるため空配列を返す。実データが要る story は自前の msw ハンドラを書く。
 *
 * パスは正規表現で書く。msw の `/api/*` は 1 セグメントしか一致せず、`i/registry/keys` のような
 * 深いパスを取りこぼす (実測)。
 *
 * **commonHandlers には入れない。** story は `[...commonHandlers, 独自のハンドラ]` と書くため、
 * 独自ハンドラより先に一致してしまう。ハンドラ一覧の最後に置く。
 */
export const apiFallbackHandler = http.all(/\/api\//, () => HttpResponse.json([]));
