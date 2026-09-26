/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiGetOnlineUsersCount } from '../auth/availability.js';
import { handleApiPing, handleApiServerInfo, handleApiTest } from '../meta/meta.js';
import { handleApiRequestResetPassword } from '../auth/password-reset.js';
import { handleApiRetention } from '../retention/retention.js';
import { jsonResponse, emptyResponse, jsonBody, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerMiscRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/ping', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, handleApiPing());
		});
	});

	app.get(
		'/retention',
		endpointHandlerAnonymous(deps, 'retention', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRetention(deps, {}), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/retention',
		endpointHandlerAnonymous(deps, 'retention', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiRetention(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			}),
		),
	);

	app.post(
		'/request-reset-password',
		endpointHandlerAnonymous(deps, 'request-reset-password', async ({ body, auth, c }) => {
			await handleApiRequestResetPassword(deps, body);
			return emptyResponse(c);
		}),
	);

	app.get(
		'/server-info',
		endpointHandlerAnonymous(deps, 'server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/server-info',
		endpointHandlerAnonymous(deps, 'server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post('/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, handleApiTest(body));
		});
	});

	app.get(
		'/get-online-users-count',
		endpointHandlerAnonymous(deps, 'get-online-users-count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);

	app.post(
		'/get-online-users-count',
		endpointHandlerAnonymous(deps, 'get-online-users-count', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			}),
		),
	);
}
