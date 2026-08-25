/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { beforeAll, describe, expect, test } from 'vitest';
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
		const roomRes = await api(
			'chat/rooms/create',
			{
				name: 'team room',
				description: 'room for drizzle migration',
			},
			alice,
		);
		expect(roomRes.status).toBe(200);
		expect(roomRes.body.name).toBe('team room');
		expect(roomRes.body.ownerId).toBe(alice.id);

		const roomId = roomRes.body.id;

		const owned = await api(
			'chat/rooms/owned',
			{
				limit: 10,
			},
			alice,
		);
		expect(owned.status).toBe(200);
		assert.ok(owned.body.some((room) => room.id === roomId && room.name === 'team room'));

		const show = await api(
			'chat/rooms/show',
			{
				roomId,
			},
			alice,
		);
		expect(show.status).toBe(200);
		expect(show.body.id).toBe(roomId);

		const update = await api(
			'chat/rooms/update',
			{
				roomId,
				name: 'team room updated',
				description: 'updated room for drizzle migration',
			},
			alice,
		);
		expect(update.status).toBe(200);
		expect(update.body.name).toBe('team room updated');
		expect(update.body.description).toBe('updated room for drizzle migration');

		const inviteBob = await api(
			'chat/rooms/invitations/create',
			{
				roomId,
				userId: bob.id,
			},
			alice,
		);
		expect(inviteBob.status).toBe(200);
		expect(inviteBob.body.roomId).toBe(roomId);
		expect(inviteBob.body.userId).toBe(bob.id);

		const outbox = await api(
			'chat/rooms/invitations/outbox',
			{
				roomId,
				limit: 10,
			},
			alice,
		);
		expect(outbox.status).toBe(200);
		assert.ok(outbox.body.some((invitation) => invitation.id === inviteBob.body.id));

		const inbox = await api(
			'chat/rooms/invitations/inbox',
			{
				limit: 10,
			},
			bob,
		);
		expect(inbox.status).toBe(200);
		assert.ok(inbox.body.some((invitation) => invitation.roomId === roomId));

		const join = await api('chat/rooms/join', { roomId }, bob);
		expect(join.status).toBe(204);

		const joinedRooms = await api(
			'chat/rooms/joining',
			{
				limit: 10,
			},
			bob,
		);
		expect(joinedRooms.status).toBe(200);
		assert.ok(
			joinedRooms.body.some(
				(membership) => membership.roomId === roomId && membership.room?.name === 'team room updated',
			),
		);

		const members = await api(
			'chat/rooms/members',
			{
				roomId,
				limit: 10,
			},
			alice,
		);
		expect(members.status).toBe(200);
		assert.ok(members.body.some((membership) => membership.userId === bob.id && membership.user?.username === 'bob'));

		const mute = await api(
			'chat/rooms/mute',
			{
				roomId,
				mute: true,
			},
			bob,
		);
		expect(mute.status).toBe(204);

		const mutedRooms = await api(
			'chat/rooms/joining',
			{
				limit: 10,
			},
			bob,
		);
		expect(mutedRooms.status).toBe(200);
		assert.ok(mutedRooms.body.some((membership) => membership.roomId === roomId && membership.room?.isMuted === true));

		const message = await api(
			'chat/messages/create-to-room',
			{
				toRoomId: roomId,
				text: 'hello room',
			},
			bob,
		);
		expect(message.status).toBe(200);
		expect(message.body.text).toBe('hello room');
		expect(message.body.toRoomId).toBe(roomId);

		const timeline = await api(
			'chat/messages/room-timeline',
			{
				roomId,
				limit: 10,
			},
			alice,
		);
		expect(timeline.status).toBe(200);
		assert.ok(timeline.body.some((item) => item.id === message.body.id && item.text === 'hello room'));

		const search = await api(
			'chat/messages/search',
			{
				query: 'hello',
				limit: 10,
			},
			bob,
		);
		expect(search.status).toBe(200);
		assert.ok(search.body.some((item) => item.id === message.body.id && item.toRoomId === roomId));

		const inviteCarol = await api(
			'chat/rooms/invitations/create',
			{
				roomId,
				userId: carol.id,
			},
			alice,
		);
		expect(inviteCarol.status).toBe(200);

		const ignore = await api(
			'chat/rooms/invitations/ignore',
			{
				roomId,
			},
			carol,
		);
		expect(ignore.status).toBe(204);

		const carolInbox = await api(
			'chat/rooms/invitations/inbox',
			{
				limit: 10,
			},
			carol,
		);
		expect(carolInbox.status).toBe(200);
		expect(carolInbox.body.some((invitation) => invitation.roomId === roomId)).toBe(false);

		const leave = await api('chat/rooms/leave', { roomId }, bob);
		expect(leave.status).toBe(204);

		const afterLeave = await api(
			'chat/rooms/joining',
			{
				limit: 10,
			},
			bob,
		);
		expect(afterLeave.status).toBe(200);
		expect(afterLeave.body.some((membership) => membership.roomId === roomId)).toBe(false);

		const remove = await api('chat/rooms/delete', { roomId }, alice);
		expect(remove.status).toBe(204);
	});
});
