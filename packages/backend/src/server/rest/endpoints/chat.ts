/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as chatContracts } from '@/server/api/metas/chat.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
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

export const chatEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(chatContracts, [
		'chat/messages/create-to-user',
		'chat/messages/create-to-room',
		'chat/messages/delete',
		'chat/messages/show',
		'chat/messages/react',
		'chat/messages/unreact',
		'chat/messages/user-timeline',
		'chat/messages/room-timeline',
		'chat/messages/search',
		'chat/rooms/create',
		'chat/rooms/delete',
		'chat/rooms/join',
		'chat/rooms/leave',
		'chat/rooms/mute',
		'chat/rooms/show',
		'chat/rooms/owned',
		'chat/rooms/joining',
		'chat/rooms/update',
		'chat/rooms/members',
		'chat/rooms/invitations/create',
		'chat/rooms/invitations/ignore',
		'chat/rooms/invitations/inbox',
		'chat/rooms/invitations/outbox',
		'chat/history',
	]),
	{
		'chat/messages/create-to-user': async ({ deps, input, me }) =>
			await handleApiChatMessagesCreateToUser(deps, me, input),
		'chat/messages/create-to-room': async ({ deps, input, me }) =>
			await handleApiChatMessagesCreateToRoom(deps, me, input),
		'chat/messages/delete': async ({ deps, input, me }) => {
			await handleApiChatMessagesDelete(deps, me, input);
		},
		'chat/messages/show': async ({ deps, input, me }) => await handleApiChatMessagesShow(deps, me, input),
		'chat/messages/react': async ({ deps, input, me }) => {
			await handleApiChatMessagesReact(deps, me, input);
		},
		'chat/messages/unreact': async ({ deps, input, me }) => {
			await handleApiChatMessagesUnreact(deps, me, input);
		},
		'chat/messages/user-timeline': async ({ deps, input, me }) =>
			await handleApiChatMessagesUserTimeline(deps, me, input),
		'chat/messages/room-timeline': async ({ deps, input, me }) =>
			await handleApiChatMessagesRoomTimeline(deps, me, input),
		'chat/messages/search': async ({ deps, input, me }) => await handleApiChatMessagesSearch(deps, me, input),
		'chat/rooms/create': async ({ deps, input, me }) => await handleApiChatRoomsCreate(deps, me, input),
		'chat/rooms/delete': async ({ deps, input, me }) => {
			await handleApiChatRoomsDelete(deps, me, input);
		},
		'chat/rooms/join': async ({ deps, input, me }) => {
			await handleApiChatRoomsJoin(deps, me, input);
		},
		'chat/rooms/leave': async ({ deps, input, me }) => {
			await handleApiChatRoomsLeave(deps, me, input);
		},
		'chat/rooms/mute': async ({ deps, input, me }) => {
			await handleApiChatRoomsMute(deps, me, input);
		},
		'chat/rooms/show': async ({ deps, input, me }) => await handleApiChatRoomsShow(deps, me, input),
		'chat/rooms/owned': async ({ deps, input, me }) => await handleApiChatRoomsOwned(deps, me, input),
		'chat/rooms/joining': async ({ deps, input, me }) => await handleApiChatRoomsJoining(deps, me, input),
		'chat/rooms/update': async ({ deps, input, me }) => await handleApiChatRoomsUpdate(deps, me, input),
		'chat/rooms/members': async ({ deps, input, me }) => await handleApiChatRoomsMembers(deps, me, input),
		'chat/rooms/invitations/create': async ({ deps, input, me }) =>
			await handleApiChatRoomsInvitationsCreate(deps, me, input),
		'chat/rooms/invitations/ignore': async ({ deps, input, me }) => {
			await handleApiChatRoomsInvitationsIgnore(deps, me, input);
		},
		'chat/rooms/invitations/inbox': async ({ deps, input, me }) =>
			await handleApiChatRoomsInvitationsInbox(deps, me, input),
		'chat/rooms/invitations/outbox': async ({ deps, input, me }) =>
			await handleApiChatRoomsInvitationsOutbox(deps, me, input),
		'chat/history': async ({ deps, input, me }) => await handleApiChatHistory(deps, me, input),
	},
);
