/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiAdminGetIndexStats, handleHonoApiAdminGetTableStats } from '../admin-stats.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleHonoApiAdminCaptchaCurrent, handleHonoApiAdminCaptchaSave } from '../captcha.js';
import {
	handleHonoApiAdminQueueAbandonOutboxDeadLetter,
	handleHonoApiAdminQueueClear,
	handleHonoApiAdminQueueDeliverDelayed,
	handleHonoApiAdminQueueInboxDelayed,
	handleHonoApiAdminQueueJobs,
	handleHonoApiAdminQueueOutboxDeadLetters,
	handleHonoApiAdminQueuePause,
	handleHonoApiAdminQueuePromoteJobs,
	handleHonoApiAdminQueueQueueStats,
	handleHonoApiAdminQueueQueues,
	handleHonoApiAdminQueueRemoveJob,
	handleHonoApiAdminQueueResume,
	handleHonoApiAdminQueueRetryJob,
	handleHonoApiAdminQueueRetryOutboxDeadLetter,
	handleHonoApiAdminQueueShowJob,
	handleHonoApiAdminQueueShowJobLogs,
	handleHonoApiAdminQueueStats,
} from '../admin-queue.js';
import { isHonoApiAdministrator } from '../role-policy.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertHonoApiModerator,
	assertHonoApiAdmin,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerAdminQueueRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/admin/queue/queues',
		endpointHandler(deps, 'admin/queue/queues', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueQueues(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/queue-stats',
		endpointHandler(deps, 'admin/queue/queue-stats', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueQueueStats(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/stats',
		endpointHandler(deps, 'admin/queue/stats', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueStats(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/deliver-delayed',
		endpointHandler(deps, 'admin/queue/deliver-delayed', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueDeliverDelayed(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/inbox-delayed',
		endpointHandler(deps, 'admin/queue/inbox-delayed', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueInboxDelayed(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/jobs',
		endpointHandler(deps, 'admin/queue/jobs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueJobs(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/outbox-dead-letters',
		endpointHandler(deps, 'admin/queue/outbox-dead-letters', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueOutboxDeadLetters(deps, body)),
		),
	);

	app.post('/admin/queue/retry-outbox-dead-letter', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueRetryOutboxDeadLetter(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/abandon-outbox-dead-letter', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueAbandonOutboxDeadLetter(deps, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/show-job',
		endpointHandler(deps, 'admin/queue/show-job', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueShowJob(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/queue/show-job-logs',
		endpointHandler(deps, 'admin/queue/show-job-logs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminQueueShowJobLogs(deps, body)),
		),
	);

	app.post('/admin/queue/clear', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueClear(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/pause', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueuePause(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/resume', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueResume(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/promote-jobs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueuePromoteJobs(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/retry-job', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueRetryJob(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/remove-job', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueRemoveJob(deps, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/admin/get-index-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!(await isHonoApiAdministrator(deps, auth.user))) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:index-stats');

			return jsonResponse(c, await handleHonoApiAdminGetIndexStats(deps, body));
		});
	});

	app.on(['POST', 'QUERY'], '/admin/get-table-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!(await isHonoApiAdministrator(deps, auth.user))) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:table-stats');

			return jsonResponse(c, await handleHonoApiAdminGetTableStats(deps, body));
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/admin/captcha/current',
		endpointHandler(deps, 'admin/captcha/current', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminCaptchaCurrent(deps, body)),
		),
	);

	app.post('/admin/captcha/save', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiAdmin(deps, auth);
			assertTokenPermission(auth, 'write:admin:meta');

			await handleHonoApiAdminCaptchaSave(deps, body);
			return emptyResponse(c);
		});
	});
}
