/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiChatReadAll } from '../chat/chat.js';
import { emptyResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerChatRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/chat/read-all',
		endpointHandler(deps, 'chat/read-all', async ({ body, auth, c }) => {
			await handleApiChatReadAll(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);
}
