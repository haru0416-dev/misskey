/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { http, HttpResponse } from 'msw';
import type { SharedOptions } from 'msw';
import aboutIconUrl from '../../assets/about-icon.png?url';
import fediUrl from '../../assets/fedi.jpg?url';

// fakes.ts が参照する、GitHub 上の画像。ネットワークに依存して story が不安定にならないよう、同じ内容のリポジトリ内のファイルを返す。
const repositoryAssets: Record<string, { url: string; type: string }> = {
	'fedi.jpg': { url: fediUrl, type: 'image/jpeg' },
	'about-icon.png': { url: aboutIconUrl, type: 'image/png' },
};

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
	http.get('https://github.com/misskey-dev/misskey/blob/master/packages/frontend/assets/:file', async ({ params }) => {
		const asset = repositoryAssets[String(params['file'])];
		if (asset == null) return new HttpResponse(null, { status: 404 });
		const body = await fetch(asset.url).then((response) => response.blob());
		return new HttpResponse(body, { headers: { 'Content-Type': asset.type } });
	}),
	// ログイン済みで動かすと preferences / persisted-state が起動時にレジストリを読む。
	http.all('/api/i/registry/get-all', () => HttpResponse.json({})),
	http.all('/api/i/registry/keys', () => HttpResponse.json([])),
	http.all('/api/i/registry/get', () => HttpResponse.json({ error: { code: 'NO_SUCH_KEY' } }, { status: 400 })),
	http.all('/api/i/registry/set', () => new HttpResponse(null, { status: 204 })),
	http.all(/\/api\/stats/, () => HttpResponse.json({ notesCount: 0, usersCount: 0, instances: 0 })),
];

export const unexpectedApiRequests: string[] = [];

/** 未登録 API を成功扱いにすると、間違った endpoint や応答契約を検出できない。 */
export const apiFallbackHandler = http.all(/\/api\//, ({ request }) => {
	const path = new URL(request.url).pathname;
	unexpectedApiRequests.push(`${request.method} ${path}`);
	return HttpResponse.json({ error: { code: 'UNMOCKED_STORY_API', message: path } }, { status: 500 });
});
