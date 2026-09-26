/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiStats } from '../chart/charts.js';
import { jsonResponse } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerChartsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/stats',
		endpointHandlerAnonymous(deps, 'stats', async ({ body, auth, c }) => jsonResponse(c, await handleApiStats(deps))),
	);
}
