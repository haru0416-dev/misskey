/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiChannelsTimeline } from '../channel/channels.js';
import { jsonResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerChannelsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/channels/timeline',
		endpointHandlerAnonymous(deps, 'channels/timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChannelsTimeline(deps, auth.user, body)),
		),
	);
}
