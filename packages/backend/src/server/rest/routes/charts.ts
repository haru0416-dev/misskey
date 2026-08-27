/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	handleApiChartsActiveUsers,
	handleApiChartsApRequest,
	handleApiChartsDrive,
	handleApiChartsFederation,
	handleApiChartsInstance,
	handleApiChartsNotes,
	handleApiChartsUserDrive,
	handleApiChartsUserFollowing,
	handleApiChartsUserNotes,
	handleApiChartsUserPv,
	handleApiChartsUserReactions,
	handleApiChartsUsers,
	handleApiStats,
	normalizeApiChartQuery,
} from '../chart/charts.js';
import {
	jsonResponse,
	publicCacheHeadersWhenAnonymous,
	jsonBody,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerChartsRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get('/charts/active-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsActiveUsers(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/active-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsActiveUsers(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/ap-request', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsApRequest(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/ap-request', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsApRequest(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleApiChartsDrive(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.on(['POST', 'QUERY'], '/charts/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleApiChartsDrive(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/federation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsFederation(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/federation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsFederation(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsInstance(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsInstance(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleApiChartsNotes(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.on(['POST', 'QUERY'], '/charts/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleApiChartsNotes(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleApiChartsUsers(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.on(['POST', 'QUERY'], '/charts/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleApiChartsUsers(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsUserDrive(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/user/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsUserDrive(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/user/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsUserFollowing(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/user/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsUserFollowing(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/user/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsUserNotes(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/user/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsUserNotes(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.get('/charts/user/pv', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsUserPv(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/user/pv', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleApiChartsUserPv(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiChartsUserReactions(deps, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/charts/user/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiChartsUserReactions(deps, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.post(
		'/stats',
		endpointHandlerAnonymous(deps, 'stats', async ({ body, auth, c }) => jsonResponse(c, await handleApiStats(deps))),
	);
}
