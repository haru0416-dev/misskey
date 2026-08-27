/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import {
	handleApiNotes,
	handleApiNotesChildren,
	handleApiNotesClips,
	handleApiNotesConversation,
	handleApiNotesFavoritesCreate,
	handleApiNotesFavoritesDelete,
	handleApiNotesFeatured,
	handleApiNotesGlobalTimeline,
	handleApiNotesHybridTimeline,
	handleApiNotesLocalTimeline,
	handleApiNotesMentions,
	handleApiNotesPollsRecommendation,
	handleApiNotesRenotes,
	handleApiNotesReplies,
	handleApiNotesSearch,
	handleApiNotesSearchByTag,
	handleApiNotesShow,
	handleApiNotesShowPartialBulk,
	handleApiNotesState,
	handleApiNotesThreadMutingCreate,
	handleApiNotesThreadMutingDelete,
	handleApiNotesTimeline,
	handleApiNotesUserListTimeline,
	notesFeaturedParamDef,
} from '../note/notes.js';
import {
	handleApiNotesTranslate,
	handleApiUsersFeaturedNotes,
	handleApiUsersNotes,
	usersFeaturedNotesParamDef,
} from '../note/note.js';
import { handleApiNotesCreate } from '../note/notes-create.js';
import {
	handleApiNotesDelete,
	handleApiNotesUnrenote,
	notesDeleteRateLimit,
	notesUnrenoteRateLimit,
} from '../note/notes-delete.js';
import {
	handleApiNotesReactions,
	handleApiNotesReactionsCreate,
	handleApiNotesReactionsDelete,
	notesReactionsParamDef,
	reactionsDeleteRateLimit,
} from '../note/notes-reactions.js';
import { handleApiNotesPollsVote } from '../note/notes-polls-vote.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
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
import { queryToApiBody } from '../query-params.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerNotesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/notes/create',
		endpointHandler(deps, 'notes/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/notes/delete',
		endpointHandler(deps, 'notes/delete', async ({ body, auth, c }) => {
			await assertApiRateLimitForUser(deps, 'notes/delete', notesDeleteRateLimit, auth.user);

			await handleApiNotesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes/unrenote',
		endpointHandler(deps, 'notes/unrenote', async ({ body, auth, c }) => {
			await assertApiRateLimitForUser(deps, 'notes/unrenote', notesUnrenoteRateLimit, auth.user);

			await handleApiNotesUnrenote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes/reactions/create',
		endpointHandler(deps, 'notes/reactions/create', async ({ body, auth, c }) => {
			await handleApiNotesReactionsCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes/reactions/delete',
		endpointHandler(deps, 'notes/reactions/delete', async ({ body, auth, c }) => {
			await assertApiRateLimitForUser(deps, 'notes/reactions/delete', reactionsDeleteRateLimit, auth.user);

			await handleApiNotesReactionsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.get('/notes/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = queryToApiBody(notesReactionsParamDef, c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiNotesReactions(deps, auth.user, query),
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
				await handleApiNotesReactions(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 60),
			);
		});
	});

	app.post(
		'/notes/polls/vote',
		endpointHandler(deps, 'notes/polls/vote', async ({ body, auth, c }) => {
			await handleApiNotesPollsVote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/show',
		endpointHandlerAnonymous(deps, 'notes/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/children',
		endpointHandlerAnonymous(deps, 'notes/children', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesChildren(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/conversation',
		endpointHandlerAnonymous(deps, 'notes/conversation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesConversation(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/mentions',
		endpointHandler(deps, 'notes/mentions', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesMentions(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/replies',
		endpointHandlerAnonymous(deps, 'notes/replies', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesReplies(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/renotes',
		endpointHandlerAnonymous(deps, 'notes/renotes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesRenotes(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/state',
		endpointHandler(deps, 'notes/state', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesState(deps, auth.user, body)),
		),
	);

	app.post(
		'/notes/favorites/create',
		endpointHandler(deps, 'notes/favorites/create', async ({ body, auth, c }) => {
			await handleApiNotesFavoritesCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes/favorites/delete',
		endpointHandler(deps, 'notes/favorites/delete', async ({ body, auth, c }) => {
			await handleApiNotesFavoritesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes/thread-muting/create',
		endpointHandler(deps, 'notes/thread-muting/create', async ({ body, auth, c }) => {
			await handleApiNotesThreadMutingCreate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes/thread-muting/delete',
		endpointHandler(deps, 'notes/thread-muting/delete', async ({ body, auth, c }) => {
			await handleApiNotesThreadMutingDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/notes',
		endpointHandlerAnonymous(deps, 'notes', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotes(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/global-timeline',
		endpointHandlerAnonymous(deps, 'notes/global-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesGlobalTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/local-timeline',
		endpointHandlerAnonymous(deps, 'notes/local-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesLocalTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/hybrid-timeline',
		endpointHandler(deps, 'notes/hybrid-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesHybridTimeline(deps, auth.user, body)),
		),
	);

	app.get('/notes/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = queryToApiBody(notesFeaturedParamDef, c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(
				c,
				await handleApiNotesFeatured(deps, auth.user, query),
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
				await handleApiNotesFeatured(deps, auth.user, body),
				200,
				publicCacheHeadersWhenAnonymous(auth, 3600),
			);
		});
	});

	app.on(['POST', 'QUERY'], '/notes/translate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			const result = await handleApiNotesTranslate(deps, auth.user, body);
			if (result === undefined) return emptyResponse(c);
			return jsonResponse(c, result);
		});
	});

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

	app.on(
		['POST', 'QUERY'],
		'/notes/clips',
		endpointHandlerAnonymous(deps, 'notes/clips', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesClips(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/search',
		endpointHandlerAnonymous(deps, 'notes/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/search-by-tag',
		endpointHandlerAnonymous(deps, 'notes/search-by-tag', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesSearchByTag(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/show-partial-bulk',
		endpointHandlerAnonymous(deps, 'notes/show-partial-bulk', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesShowPartialBulk(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/timeline',
		endpointHandler(deps, 'notes/timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/user-list-timeline',
		endpointHandler(deps, 'notes/user-list-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesUserListTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/notes/polls/recommendation',
		endpointHandler(deps, 'notes/polls/recommendation', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiNotesPollsRecommendation(deps, auth.user, body)),
		),
	);
}
