/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiAdminGetIndexStats, handleHonoApiAdminGetTableStats } from '../admin-stats.js';
import { rolePermissionDeniedError } from '../error.js';
import { handleHonoApiAdminCaptchaCurrent, handleHonoApiAdminCaptchaSave } from '../captcha.js';
import { handleHonoApiAdminQueueClear, handleHonoApiAdminQueueDeliverDelayed, handleHonoApiAdminQueueInboxDelayed, handleHonoApiAdminQueueJobs, handleHonoApiAdminQueuePause, handleHonoApiAdminQueuePromoteJobs, handleHonoApiAdminQueueQueueStats, handleHonoApiAdminQueueQueues, handleHonoApiAdminQueueRemoveJob, handleHonoApiAdminQueueResume, handleHonoApiAdminQueueRetryJob, handleHonoApiAdminQueueShowJob, handleHonoApiAdminQueueShowJobLogs, handleHonoApiAdminQueueStats } from '../admin-queue.js';
import { isHonoApiAdministrator } from '../role-policy.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint, assertHonoApiModerator, assertHonoApiAdmin } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerAdminQueueRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/admin/queue/queues', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueQueues(deps, body));
		});
	});

	app.post('/admin/queue/queue-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueQueueStats(deps, body));
		});
	});

	app.post('/admin/queue/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueStats(deps, body));
		});
	});

	app.post('/admin/queue/deliver-delayed', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueDeliverDelayed(deps, body));
		});
	});

	app.post('/admin/queue/inbox-delayed', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueInboxDelayed(deps, body));
		});
	});

	app.post('/admin/queue/jobs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueJobs(deps, body));
		});
	});

	app.post('/admin/queue/show-job', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueShowJob(deps, body));
		});
	});

	app.post('/admin/queue/show-job-logs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueShowJobLogs(deps, body));
		});
	});

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

	app.post('/admin/get-index-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!await isHonoApiAdministrator(deps, auth.user)) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:index-stats');

			return jsonResponse(c, await handleHonoApiAdminGetIndexStats(deps, body));
		});
	});

	app.post('/admin/get-table-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!await isHonoApiAdministrator(deps, auth.user)) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:table-stats');

			return jsonResponse(c, await handleHonoApiAdminGetTableStats(deps, body));
		});
	});

	app.post('/admin/captcha/current', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiAdmin(deps, auth);
			assertTokenPermission(auth, 'read:admin:meta');

			return jsonResponse(c, await handleHonoApiAdminCaptchaCurrent(deps, body));
		});
	});

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
