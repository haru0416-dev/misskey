/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { type SharedOptions, http, HttpResponse } from 'msw';

export const onUnhandledRequest = ((req, print) => {
	const url = new URL(req.url);
	if (
		url.hostname !== 'localhost' ||
		// `@vite/` 等は v2 の initialize() が内部で除外していたぶん。自前で setupWorker を
		// 起動する以上こちらで持つ必要がある。
		/^\/(?:@|client-assets\/|fluent-emoji\/|iframe.html$|node_modules\/|src\/|sb-|static-assets\/|virtual:|vite\/)/.test(
			url.pathname,
		)
	) {
		return;
	}
	print.warning();
}) satisfies SharedOptions['onUnhandledRequest'];

export const commonHandlers = [
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
