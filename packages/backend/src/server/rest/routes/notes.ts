/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { handleApiUsersFeaturedNotes, handleApiUsersNotes, usersFeaturedNotesParamDef } from '../note/note.js';
import {
	jsonResponse,
	publicCacheHeadersWhenAnonymous,
	jsonBody,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { queryToApiBody } from '../string-params.js';
import { endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerNotesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.get('/users/featured-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = queryToApiBody(usersFeaturedNotesParamDef, c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiUsersFeaturedNotes(deps, auth.user, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/users/featured-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleApiUsersFeaturedNotes(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/users/notes',
		endpointHandlerAnonymous(deps, 'users/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiUsersNotes(deps, auth.user, body)),
		),
	);
}
