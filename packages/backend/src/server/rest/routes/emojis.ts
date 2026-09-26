/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiEmoji, handleApiEmojis, handleApiV2AdminEmojiList } from '../emoji/emojis.js';
import { jsonResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerEmojisRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get(
		'/emoji',
		endpointHandlerAnonymous(deps, 'emoji', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmoji(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/emoji',
		endpointHandlerAnonymous(deps, 'emoji', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmoji(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.get(
		'/emojis',
		endpointHandlerAnonymous(deps, 'emojis', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/emojis',
		endpointHandlerAnonymous(deps, 'emojis', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/v2/admin/emoji/list',
		endpointHandler(deps, 'v2/admin/emoji/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiV2AdminEmojiList(deps, body)),
		),
	);
}
