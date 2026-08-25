/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import {
	handleHonoApiNotes,
	handleHonoApiNotesChildren,
	handleHonoApiNotesClips,
	handleHonoApiNotesConversation,
	handleHonoApiNotesFavoritesCreate,
	handleHonoApiNotesFavoritesDelete,
	handleHonoApiNotesFeatured,
	handleHonoApiNotesGlobalTimeline,
	handleHonoApiNotesHybridTimeline,
	handleHonoApiNotesLocalTimeline,
	handleHonoApiNotesMentions,
	handleHonoApiNotesPollsRecommendation,
	handleHonoApiNotesRenotes,
	handleHonoApiNotesReplies,
	handleHonoApiNotesSearch,
	handleHonoApiNotesSearchByTag,
	handleHonoApiNotesShow,
	handleHonoApiNotesShowPartialBulk,
	handleHonoApiNotesState,
	handleHonoApiNotesThreadMutingCreate,
	handleHonoApiNotesThreadMutingDelete,
	handleHonoApiNotesTimeline,
	handleHonoApiNotesUserListTimeline,
	normalizeHonoApiNotesFeaturedQuery,
} from '../notes.js';
import {
	handleHonoApiNotesTranslate,
	handleHonoApiUsersFeaturedNotes,
	handleHonoApiUsersNotes,
	normalizeHonoApiUsersFeaturedNotesQuery,
} from '../note.js';
import { handleHonoApiNotesCreate } from '../notes-create.js';
import {
	handleHonoApiNotesDelete,
	handleHonoApiNotesUnrenote,
	notesDeleteRateLimit,
	notesUnrenoteRateLimit,
} from '../notes-delete.js';
import {
	handleHonoApiNotesReactions,
	handleHonoApiNotesReactionsCreate,
	handleHonoApiNotesReactionsDelete,
	normalizeHonoApiNotesReactionsQuery,
	reactionsDeleteRateLimit,
} from '../notes-reactions.js';
import { handleHonoApiNotesPollsVote } from '../notes-polls-vote.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import {
	jsonResponse,
	emptyResponse,
	publicCacheHeadersWhenAnonymous,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	authenticateOptionalRequest,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerNotesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/notes/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:notes');
			await assertHonoApiRateLimitForUser(
				deps,
				'notes/create',
				{
					duration: 60 * 60 * 1000,
					max: 300,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiNotesCreate(deps, auth.user, body));
		});
	});

	app.post('/notes/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notes');
			await assertHonoApiRateLimitForUser(deps, 'notes/delete', notesDeleteRateLimit, auth.user);

			await handleHonoApiNotesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/unrenote', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notes');
			await assertHonoApiRateLimitForUser(deps, 'notes/unrenote', notesUnrenoteRateLimit, auth.user);

			await handleHonoApiNotesUnrenote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/reactions/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:reactions');

			await handleHonoApiNotesReactionsCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/reactions/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:reactions');
			await assertHonoApiRateLimitForUser(deps, 'notes/reactions/delete', reactionsDeleteRateLimit, auth.user);

			await handleHonoApiNotesReactionsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.get('/notes/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiNotesReactionsQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleHonoApiNotesReactions(deps, auth.user, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 60),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/notes/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleHonoApiNotesReactions(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 60),
			);
		});
	});

	app.post('/notes/polls/vote', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:votes');

			await handleHonoApiNotesPollsVote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/notes/show',
		endpointHandlerAnonymous(deps, 'notes/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/children',
		endpointHandlerAnonymous(deps, 'notes/children', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesChildren(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/conversation',
		endpointHandlerAnonymous(deps, 'notes/conversation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesConversation(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/mentions',
		endpointHandler(deps, 'notes/mentions', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesMentions(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/replies',
		endpointHandlerAnonymous(deps, 'notes/replies', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesReplies(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/renotes',
		endpointHandlerAnonymous(deps, 'notes/renotes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesRenotes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/state',
		endpointHandler(deps, 'notes/state', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesState(deps, auth.user, body)),
		),
	);

	app.post('/notes/favorites/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:favorites');
			await assertHonoApiRateLimitForUser(
				deps,
				'notes/favorites/create',
				{
					duration: 60 * 60 * 1000,
					max: 20,
				},
				auth.user,
			);

			await handleHonoApiNotesFavoritesCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/favorites/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:favorites');

			await handleHonoApiNotesFavoritesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/thread-muting/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimitForUser(
				deps,
				'notes/thread-muting/create',
				{
					duration: 60 * 60 * 1000,
					max: 10,
				},
				auth.user,
			);

			await handleHonoApiNotesThreadMutingCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/thread-muting/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiNotesThreadMutingDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post(
		'/notes',
		endpointHandlerAnonymous(deps, 'notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotes(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/global-timeline',
		endpointHandlerAnonymous(deps, 'notes/global-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesGlobalTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/local-timeline',
		endpointHandlerAnonymous(deps, 'notes/local-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesLocalTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/hybrid-timeline',
		endpointHandler(deps, 'notes/hybrid-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesHybridTimeline(deps, auth.user, body)),
		),
	);

	app.get('/notes/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiNotesFeaturedQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleHonoApiNotesFeatured(deps, auth.user, query),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/notes/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(
				c,
				await handleHonoApiNotesFeatured(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/notes/translate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			const result = await handleHonoApiNotesTranslate(deps, auth.user, body);
			if (result === undefined) return emptyResponse(c);
			return jsonResponse(c, result);
		});
	});

	app.get('/users/featured-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiUsersFeaturedNotesQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleHonoApiUsersFeaturedNotes(deps, auth.user, query),
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
				await handleHonoApiUsersFeaturedNotes(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(
		['POST', 'QUERY'],
		'/users/notes',
		endpointHandlerAnonymous(deps, 'users/notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiUsersNotes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/clips',
		endpointHandlerAnonymous(deps, 'notes/clips', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesClips(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/search',
		endpointHandlerAnonymous(deps, 'notes/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/search-by-tag',
		endpointHandlerAnonymous(deps, 'notes/search-by-tag', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesSearchByTag(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/show-partial-bulk',
		endpointHandlerAnonymous(deps, 'notes/show-partial-bulk', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesShowPartialBulk(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/timeline',
		endpointHandler(deps, 'notes/timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/user-list-timeline',
		endpointHandler(deps, 'notes/user-list-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesUserListTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/polls/recommendation',
		endpointHandler(deps, 'notes/polls/recommendation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiNotesPollsRecommendation(deps, auth.user, body)),
		),
	);
}
