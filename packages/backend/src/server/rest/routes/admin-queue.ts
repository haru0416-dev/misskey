/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import { handleApiAdminGetIndexStats, handleApiAdminGetTableStats } from '../admin/admin-stats.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleApiAdminCaptchaCurrent, handleApiAdminCaptchaSave } from '../captcha/captcha.js';
import {
	handleApiAdminQueueDeliverDelayed,
	handleApiAdminQueueInboxDelayed,
	handleApiAdminQueueQueues,
	handleApiAdminQueueStats,
} from '../admin/admin-queue.js';
import { isApiAdministrator } from '../role/role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertApiAdmin,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAdminQueueRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/admin/queue/queues',
		endpointHandler(deps, 'admin/queue/queues', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueQueues(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/stats',
		endpointHandler(deps, 'admin/queue/stats', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueStats(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/deliver-delayed',
		endpointHandler(deps, 'admin/queue/deliver-delayed', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueDeliverDelayed(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/inbox-delayed',
		endpointHandler(deps, 'admin/queue/inbox-delayed', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueInboxDelayed(deps, body)),
		),
	);

	app.on(['POST', 'QUERY'], '/admin/get-index-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!(await isApiAdministrator(deps, auth.user))) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:index-stats');

			return jsonResponse(c, await handleApiAdminGetIndexStats(deps, body));
		});
	});

	app.on(['POST', 'QUERY'], '/admin/get-table-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!(await isApiAdministrator(deps, auth.user))) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:table-stats');

			return jsonResponse(c, await handleApiAdminGetTableStats(deps, body));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/admin/captcha/current',
		endpointHandler(deps, 'admin/captcha/current', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminCaptchaCurrent(deps, body)),
		),
	);

	app.post(
		'/admin/captcha/save',
		endpointHandler(deps, 'admin/captcha/save', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);
			assertTokenPermission(auth, 'write:admin:meta');

			await handleApiAdminCaptchaSave(deps, body);
			return emptyResponse(c);
		}),
	);
}
