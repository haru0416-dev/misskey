/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateApiToken } from '../auth/auth.js';
import {
	handleApiChatHistory,
	handleApiChatMessagesCreateToRoom,
	handleApiChatMessagesCreateToUser,
	handleApiChatMessagesDelete,
	handleApiChatMessagesReact,
	handleApiChatMessagesRoomTimeline,
	handleApiChatMessagesSearch,
	handleApiChatMessagesShow,
	handleApiChatMessagesUnreact,
	handleApiChatMessagesUserTimeline,
	handleApiChatReadAll,
	handleApiChatRoomsCreate,
	handleApiChatRoomsDelete,
	handleApiChatRoomsInvitationsCreate,
	handleApiChatRoomsInvitationsIgnore,
	handleApiChatRoomsInvitationsInbox,
	handleApiChatRoomsInvitationsOutbox,
	handleApiChatRoomsJoin,
	handleApiChatRoomsJoining,
	handleApiChatRoomsLeave,
	handleApiChatRoomsMembers,
	handleApiChatRoomsMute,
	handleApiChatRoomsOwned,
	handleApiChatRoomsShow,
	handleApiChatRoomsUpdate,
} from '../chat/chat.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler } from '../endpoint-handlers.js';

export function registerChatRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(
		['POST', 'QUERY'],
		'/chat/history',
		endpointHandler(deps, 'chat/history', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatHistory(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/read-all',
		endpointHandler(deps, 'chat/read-all', async ({ body, auth, c }) => {
			await handleApiChatReadAll(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/chat/messages/create-to-user',
		endpointHandler(deps, 'chat/messages/create-to-user', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatMessagesCreateToUser(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/messages/create-to-room',
		endpointHandler(deps, 'chat/messages/create-to-room', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatMessagesCreateToRoom(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/messages/delete',
		endpointHandler(deps, 'chat/messages/delete', async ({ body, auth, c }) => {
			await handleApiChatMessagesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/chat/messages/react',
		endpointHandler(deps, 'chat/messages/react', async ({ body, auth, c }) => {
			await handleApiChatMessagesReact(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/chat/messages/unreact',
		endpointHandler(deps, 'chat/messages/unreact', async ({ body, auth, c }) => {
			await handleApiChatMessagesUnreact(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/messages/room-timeline',
		endpointHandler(deps, 'chat/messages/room-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatMessagesRoomTimeline(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/messages/search',
		endpointHandler(deps, 'chat/messages/search', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatMessagesSearch(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/messages/show',
		endpointHandler(deps, 'chat/messages/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatMessagesShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/messages/user-timeline',
		endpointHandler(deps, 'chat/messages/user-timeline', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatMessagesUserTimeline(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/rooms/create',
		endpointHandler(deps, 'chat/rooms/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/rooms/delete',
		endpointHandler(deps, 'chat/rooms/delete', async ({ body, auth, c }) => {
			await handleApiChatRoomsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/chat/rooms/update',
		endpointHandler(deps, 'chat/rooms/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsUpdate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/rooms/show',
		endpointHandler(deps, 'chat/rooms/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsShow(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/rooms/owned',
		endpointHandler(deps, 'chat/rooms/owned', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsOwned(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/rooms/join',
		endpointHandler(deps, 'chat/rooms/join', async ({ body, auth, c }) => {
			await handleApiChatRoomsJoin(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/rooms/joining',
		endpointHandler(deps, 'chat/rooms/joining', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsJoining(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/rooms/leave',
		endpointHandler(deps, 'chat/rooms/leave', async ({ body, auth, c }) => {
			await handleApiChatRoomsLeave(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/chat/rooms/members',
		endpointHandler(deps, 'chat/rooms/members', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsMembers(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/rooms/mute',
		endpointHandler(deps, 'chat/rooms/mute', async ({ body, auth, c }) => {
			await handleApiChatRoomsMute(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/chat/rooms/invitations/create',
		endpointHandler(deps, 'chat/rooms/invitations/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsInvitationsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/chat/rooms/invitations/ignore',
		endpointHandler(deps, 'chat/rooms/invitations/ignore', async ({ body, auth, c }) => {
			await handleApiChatRoomsInvitationsIgnore(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/rooms/invitations/inbox',
		endpointHandler(deps, 'chat/rooms/invitations/inbox', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsInvitationsInbox(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/chat/rooms/invitations/outbox',
		endpointHandler(deps, 'chat/rooms/invitations/outbox', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiChatRoomsInvitationsOutbox(deps, auth.user, body)),
		),
	);
}
