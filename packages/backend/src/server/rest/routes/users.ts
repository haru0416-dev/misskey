/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiMiauthCheck } from '../auth/miauth.js';
import { jsonResponse, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerUsersRoutes(app: Hono, deps: ApiShellDependencies): void {
	// URL は MiAuth プロトコルの公開仕様 (`/api/miauth/{session}/check`) なので変えられないが、
	// `/miauth/gen-token` (static) と `/miauth/:session/check` (param) の同一位置共存は
	// RegExpRouter 非対応で、この1ルートのせいでアプリ全体が TrieRouter へフォールバックする。
	// ワイルドカードで受けてパスから session を自前で切り出す (shape 不一致は
	// 後段の catch-all による UNKNOWN_API_ENDPOINT 404 に流す)。
	app.post('/miauth/*', async (c, next) => {
		// c.req.path はマウントプレフィックス (/api) 込みのフルパスなので末尾側でマッチする
		const match = /\/miauth\/([^/]+)\/check$/.exec(c.req.path);
		if (match == null) {
			return await next();
		}

		let session = match[1];
		if (session == null) {
			return await next();
		}
		try {
			session = decodeURIComponent(session);
		} catch {
			// 不正な percent-encoding はデコードせず、そのまま扱う。
		}

		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleApiMiauthCheck(deps, session));
		});
	});
}
