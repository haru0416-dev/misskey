/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertProhibitMoved, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import {
	handleHonoApiChatHistory,
	handleHonoApiChatMessagesCreateToRoom,
	handleHonoApiChatMessagesCreateToUser,
	handleHonoApiChatMessagesDelete,
	handleHonoApiChatMessagesReact,
	handleHonoApiChatMessagesRoomTimeline,
	handleHonoApiChatMessagesSearch,
	handleHonoApiChatMessagesShow,
	handleHonoApiChatMessagesUnreact,
	handleHonoApiChatMessagesUserTimeline,
	handleHonoApiChatReadAll,
	handleHonoApiChatRoomsCreate,
	handleHonoApiChatRoomsDelete,
	handleHonoApiChatRoomsInvitationsCreate,
	handleHonoApiChatRoomsInvitationsIgnore,
	handleHonoApiChatRoomsInvitationsInbox,
	handleHonoApiChatRoomsInvitationsOutbox,
	handleHonoApiChatRoomsJoin,
	handleHonoApiChatRoomsJoining,
	handleHonoApiChatRoomsLeave,
	handleHonoApiChatRoomsMembers,
	handleHonoApiChatRoomsMute,
	handleHonoApiChatRoomsOwned,
	handleHonoApiChatRoomsShow,
	handleHonoApiChatRoomsUpdate,
} from '../chat.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerChatRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.on(['POST', 'QUERY'], '/chat/history', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatHistory(deps, auth.user, body));
		});
	});

	app.post('/chat/read-all', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatReadAll(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/chat/messages/create-to-user', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:chat');
			await assertHonoApiRateLimitForUser(
				deps,
				'chat/messages/create-to-user',
				{
					duration: 60 * 60 * 1000,
					max: 500,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiChatMessagesCreateToUser(deps, auth.user, body));
		});
	});

	app.post('/chat/messages/create-to-room', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:chat');
			await assertHonoApiRateLimitForUser(
				deps,
				'chat/messages/create-to-room',
				{
					duration: 60 * 60 * 1000,
					max: 500,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiChatMessagesCreateToRoom(deps, auth.user, body));
		});
	});

	app.post('/chat/messages/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatMessagesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/chat/messages/react', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatMessagesReact(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/chat/messages/unreact', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatMessagesUnreact(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/chat/messages/room-timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatMessagesRoomTimeline(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/chat/messages/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatMessagesSearch(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/chat/messages/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatMessagesShow(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/chat/messages/user-timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatMessagesUserTimeline(deps, auth.user, body));
		});
	});

	app.post('/chat/rooms/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:chat');
			await assertHonoApiRateLimitForUser(
				deps,
				'chat/rooms/create',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 10,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiChatRoomsCreate(deps, auth.user, body));
		});
	});

	app.post('/chat/rooms/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatRoomsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/chat/rooms/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsUpdate(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/chat/rooms/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsShow(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/chat/rooms/owned', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsOwned(deps, auth.user, body));
		});
	});

	app.post('/chat/rooms/join', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatRoomsJoin(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/chat/rooms/joining', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsJoining(deps, auth.user, body));
		});
	});

	app.post('/chat/rooms/leave', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatRoomsLeave(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/chat/rooms/members', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsMembers(deps, auth.user, body));
		});
	});

	app.post('/chat/rooms/mute', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatRoomsMute(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/chat/rooms/invitations/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:chat');
			await assertHonoApiRateLimitForUser(
				deps,
				'chat/rooms/invitations/create',
				{
					duration: 24 * 60 * 60 * 1000,
					max: 50,
				},
				auth.user,
			);

			return jsonResponse(c, await handleHonoApiChatRoomsInvitationsCreate(deps, auth.user, body));
		});
	});

	app.post('/chat/rooms/invitations/ignore', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:chat');

			await handleHonoApiChatRoomsInvitationsIgnore(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.on(['POST', 'QUERY'], '/chat/rooms/invitations/inbox', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsInvitationsInbox(deps, auth.user, body));
		});
	});

	app.on(['POST', 'QUERY'], '/chat/rooms/invitations/outbox', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:chat');

			return jsonResponse(c, await handleHonoApiChatRoomsInvitationsOutbox(deps, auth.user, body));
		});
	});
}
