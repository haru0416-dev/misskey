/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { beforeAll, describe, test } from 'vitest';
import { api, signup } from '../utils.js';

type SignupUser = Awaited<ReturnType<typeof signup>>;

describe('Chat', () => {
	let alice: SignupUser;
	let bob: SignupUser;
	let carol: SignupUser;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
	});

	test('room invitations and memberships work', async () => {
		const roomRes = await api('chat/rooms/create', {
			name: 'team room',
			description: 'room for drizzle migration',
		}, alice);
		assert.strictEqual(roomRes.status, 200);
		assert.strictEqual(roomRes.body.name, 'team room');
		assert.strictEqual(roomRes.body.ownerId, alice.id);

		const roomId = roomRes.body.id;

		const owned = await api('chat/rooms/owned', {
			limit: 10,
		}, alice);
		assert.strictEqual(owned.status, 200);
		assert.ok(owned.body.some(room => room.id === roomId && room.name === 'team room'));

		const show = await api('chat/rooms/show', {
			roomId,
		}, alice);
		assert.strictEqual(show.status, 200);
		assert.strictEqual(show.body.id, roomId);

		const update = await api('chat/rooms/update', {
			roomId,
			name: 'team room updated',
			description: 'updated room for drizzle migration',
		}, alice);
		assert.strictEqual(update.status, 200);
		assert.strictEqual(update.body.name, 'team room updated');
		assert.strictEqual(update.body.description, 'updated room for drizzle migration');

		const inviteBob = await api('chat/rooms/invitations/create', {
			roomId,
			userId: bob.id,
		}, alice);
		assert.strictEqual(inviteBob.status, 200);
		assert.strictEqual(inviteBob.body.roomId, roomId);
		assert.strictEqual(inviteBob.body.userId, bob.id);

		const outbox = await api('chat/rooms/invitations/outbox', {
			roomId,
			limit: 10,
		}, alice);
		assert.strictEqual(outbox.status, 200);
		assert.ok(outbox.body.some(invitation => invitation.id === inviteBob.body.id));

		const inbox = await api('chat/rooms/invitations/inbox', {
			limit: 10,
		}, bob);
		assert.strictEqual(inbox.status, 200);
		assert.ok(inbox.body.some(invitation => invitation.roomId === roomId));

		const join = await api('chat/rooms/join', { roomId }, bob);
		assert.strictEqual(join.status, 204);

		const joinedRooms = await api('chat/rooms/joining', {
			limit: 10,
		}, bob);
		assert.strictEqual(joinedRooms.status, 200);
		assert.ok(joinedRooms.body.some(membership => membership.roomId === roomId && membership.room?.name === 'team room updated'));

		const members = await api('chat/rooms/members', {
			roomId,
			limit: 10,
		}, alice);
		assert.strictEqual(members.status, 200);
		assert.ok(members.body.some(membership => membership.userId === bob.id && membership.user?.username === 'bob'));

		const mute = await api('chat/rooms/mute', {
			roomId,
			mute: true,
		}, bob);
		assert.strictEqual(mute.status, 204);

		const mutedRooms = await api('chat/rooms/joining', {
			limit: 10,
		}, bob);
		assert.strictEqual(mutedRooms.status, 200);
		assert.ok(mutedRooms.body.some(membership => membership.roomId === roomId && membership.room?.isMuted === true));

		const message = await api('chat/messages/create-to-room', {
			toRoomId: roomId,
			text: 'hello room',
		}, bob);
		assert.strictEqual(message.status, 200);
		assert.strictEqual(message.body.text, 'hello room');
		assert.strictEqual(message.body.toRoomId, roomId);

		const timeline = await api('chat/messages/room-timeline', {
			roomId,
			limit: 10,
		}, alice);
		assert.strictEqual(timeline.status, 200);
		assert.ok(timeline.body.some(item => item.id === message.body.id && item.text === 'hello room'));

		const search = await api('chat/messages/search', {
			query: 'hello',
			limit: 10,
		}, bob);
		assert.strictEqual(search.status, 200);
		assert.ok(search.body.some(item => item.id === message.body.id && item.toRoomId === roomId));

		const inviteCarol = await api('chat/rooms/invitations/create', {
			roomId,
			userId: carol.id,
		}, alice);
		assert.strictEqual(inviteCarol.status, 200);

		const ignore = await api('chat/rooms/invitations/ignore', {
			roomId,
		}, carol);
		assert.strictEqual(ignore.status, 204);

		const carolInbox = await api('chat/rooms/invitations/inbox', {
			limit: 10,
		}, carol);
		assert.strictEqual(carolInbox.status, 200);
		assert.strictEqual(carolInbox.body.some(invitation => invitation.roomId === roomId), false);

		const leave = await api('chat/rooms/leave', { roomId }, bob);
		assert.strictEqual(leave.status, 204);

		const afterLeave = await api('chat/rooms/joining', {
			limit: 10,
		}, bob);
		assert.strictEqual(afterLeave.status, 200);
		assert.strictEqual(afterLeave.body.some(membership => membership.roomId === roomId), false);

		const remove = await api('chat/rooms/delete', { roomId }, alice);
		assert.strictEqual(remove.status, 204);
	});
});
