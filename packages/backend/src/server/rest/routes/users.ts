/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { resolveUserForApi } from '../activitypub/ap-person.js';
import { handleApiUsersShow } from '../user/user.js';
import { handleApiMiauthCheck } from '../auth/miauth.js';
import { handleApiVerifyEmail } from '../auth/verify-email.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	getRequestIp,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';

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

	app.post('/users/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			const ip = getRequestIp(c, deps.config);

			return jsonResponse(
				c,
				await handleApiUsersShow(
					{ ...deps, resolveUser: (username, host) => resolveUserForApi(deps, username, host) },
					auth.user,
					body,
					ip,
				),
			);
		});
	});

	app.post(
		'/verify-email',
		endpointHandlerAnonymous(deps, 'verify-email', async ({ body, auth, c }) => {
			await authenticateOptionalRequest(deps, c, body);

			await handleApiVerifyEmail(deps, body);
			return emptyResponse(c);
		}),
	);
}
