/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleHonoApiChartsActiveUsers, handleHonoApiChartsApRequest, handleHonoApiChartsDrive, handleHonoApiChartsFederation, handleHonoApiChartsInstance, handleHonoApiChartsNotes, handleHonoApiChartsUserDrive, handleHonoApiChartsUserFollowing, handleHonoApiChartsUserNotes, handleHonoApiChartsUserPv, handleHonoApiChartsUserReactions, handleHonoApiChartsUsers, handleHonoApiStats, normalizeHonoApiChartQuery } from '../charts.js';
import { jsonResponse, publicCacheHeadersWhenAnonymous, jsonBody, runApiEndpoint, authenticateOptionalRequest } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerChartsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get('/charts/active-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsActiveUsers(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/active-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsActiveUsers(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/ap-request', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsApRequest(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/ap-request', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsApRequest(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsDrive(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsDrive(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/federation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsFederation(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/federation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsFederation(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsInstance(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsInstance(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsNotes(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsNotes(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUsers(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUsers(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserDrive(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserDrive(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserFollowing(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserFollowing(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserNotes(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserNotes(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/pv', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserPv(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/pv', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserPv(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserReactions(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserReactions(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiStats(deps));
		});
	});
}
