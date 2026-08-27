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
	handleApiAdminQueueAbandonOutboxDeadLetter,
	handleApiAdminQueueClear,
	handleApiAdminQueueDeliverDelayed,
	handleApiAdminQueueInboxDelayed,
	handleApiAdminQueueJobs,
	handleApiAdminQueueOutboxDeadLetters,
	handleApiAdminQueuePause,
	handleApiAdminQueuePromoteJobs,
	handleApiAdminQueueQueueStats,
	handleApiAdminQueueQueues,
	handleApiAdminQueueRemoveJob,
	handleApiAdminQueueResume,
	handleApiAdminQueueRetryJob,
	handleApiAdminQueueRetryOutboxDeadLetter,
	handleApiAdminQueueShowJob,
	handleApiAdminQueueShowJobLogs,
	handleApiAdminQueueStats,
} from '../admin/admin-queue.js';
import { isApiAdministrator } from '../role/role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertApiModerator,
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
		'/admin/queue/queue-stats',
		endpointHandler(deps, 'admin/queue/queue-stats', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueQueueStats(deps, body)),
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

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/jobs',
		endpointHandler(deps, 'admin/queue/jobs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueJobs(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/outbox-dead-letters',
		endpointHandler(deps, 'admin/queue/outbox-dead-letters', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueOutboxDeadLetters(deps, body)),
		),
	);

	app.post(
		'/admin/queue/retry-outbox-dead-letter',
		endpointHandler(deps, 'admin/queue/retry-outbox-dead-letter', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueueRetryOutboxDeadLetter(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/queue/abandon-outbox-dead-letter',
		endpointHandler(deps, 'admin/queue/abandon-outbox-dead-letter', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueueAbandonOutboxDeadLetter(deps, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/show-job',
		endpointHandler(deps, 'admin/queue/show-job', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueShowJob(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/show-job-logs',
		endpointHandler(deps, 'admin/queue/show-job-logs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminQueueShowJobLogs(deps, body)),
		),
	);

	app.post(
		'/admin/queue/clear',
		endpointHandler(deps, 'admin/queue/clear', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueueClear(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/queue/pause',
		endpointHandler(deps, 'admin/queue/pause', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueuePause(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/queue/resume',
		endpointHandler(deps, 'admin/queue/resume', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueueResume(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/queue/promote-jobs',
		endpointHandler(deps, 'admin/queue/promote-jobs', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueuePromoteJobs(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/queue/retry-job',
		endpointHandler(deps, 'admin/queue/retry-job', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueueRetryJob(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/queue/remove-job',
		endpointHandler(deps, 'admin/queue/remove-job', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminQueueRemoveJob(deps, body);
			return emptyResponse(c);
		}),
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
