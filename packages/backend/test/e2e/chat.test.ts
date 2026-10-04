/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { beforeAll, describe, expect, test } from 'vitest';
import { api, castAsError, createAppToken, role, signup } from '../utils.js';

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
		const noSuchRoomId = 'zzzzzzzzzzzzzzzzzzzzzzzzzz';
		const joinMissing = await api('chat/rooms/join', { roomId: noSuchRoomId }, bob);
		expect(joinMissing.status).toBe(400);
		expect(castAsError(joinMissing.body).error.id).toBe('84416476-5ce8-4a2c-b568-9569f1b10733');
		const leaveMissing = await api('chat/rooms/leave', { roomId: noSuchRoomId }, bob);
		expect(leaveMissing.status).toBe(400);
		expect(castAsError(leaveMissing.body).error.id).toBe('cb7f3179-50e8-4389-8c30-dbe2650a67c9');
		const muteMissing = await api('chat/rooms/mute', { roomId: noSuchRoomId, mute: true }, bob);
		expect(muteMissing.status).toBe(400);
		expect(castAsError(muteMissing.body).error.id).toBe('c2cde4eb-8d0f-42f1-8f2f-c4d6bfc8e5df');

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
		const missingInvitee = await api('chat/rooms/invitations/create', { roomId, userId: noSuchRoomId }, alice);
		expect(missingInvitee.status).toBe(400);
		expect(castAsError(missingInvitee.body).error.id).toBe('0f451b9e-fc21-491a-b2bf-46331103a945');
		const outsider = await api('chat/rooms/show', { roomId }, bob);
		expect(outsider.status).toBe(400);
		expect(castAsError(outsider.body).error.id).toBe('857ae02f-8759-4d20-9adb-6e95fffe4fd7');

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

		const duplicateInvitation = await api('chat/rooms/invitations/create', { roomId, userId: bob.id }, alice);
		expect(duplicateInvitation.status).toBe(400);
		expect(castAsError(duplicateInvitation.body).error.code).toBe('CANNOT_CREATE_INVITATION');
		const selfInvitation = await api('chat/rooms/invitations/create', { roomId, userId: alice.id }, alice);
		expect(selfInvitation.status).toBe(400);
		expect(castAsError(selfInvitation.body).error.code).toBe('INVALID_PARAM');

		const parallelInvitations = await Promise.all([
			api('chat/rooms/invitations/create', { roomId, userId: carol.id }, alice),
			api('chat/rooms/invitations/create', { roomId, userId: carol.id }, alice),
		]);
		expect(parallelInvitations.filter((result) => result.status === 200)).toHaveLength(1);
		const parallelDuplicate = parallelInvitations.find((result) => result.status === 400);
		assert.ok(parallelDuplicate);
		expect(castAsError(parallelDuplicate.body).error.code).toBe('CANNOT_CREATE_INVITATION');
		const [parallelJoin, invitationDuringJoin] = await Promise.all([
			api('chat/rooms/join', { roomId }, carol),
			api('chat/rooms/invitations/create', { roomId, userId: carol.id }, alice),
		]);
		expect(parallelJoin.status).toBe(204);
		expect(invitationDuringJoin.status).toBe(400);
		expect(castAsError(invitationDuringJoin.body).error.code).toBe('CANNOT_CREATE_INVITATION');
		const parallelLeave = await api('chat/rooms/leave', { roomId }, carol);
		expect(parallelLeave.status).toBe(204);

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

		const readOnlyToken = await createAppToken(alice, ['read:chat']);
		const membersWithReadOnlyToken = await api('chat/rooms/members', { roomId }, { token: readOnlyToken });
		expect(membersWithReadOnlyToken.status).toBe(403);

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

		const ownerMessage = await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'owner message' }, alice);
		expect(ownerMessage.status).toBe(200);
		expect(ownerMessage.body.toRoomId).toBe(roomId);
		const memberTimeline = await api('chat/messages/room-timeline', { roomId }, bob);
		expect(memberTimeline.status).toBe(200);
		expect(memberTimeline.body.some((item) => item.id === ownerMessage.body.id)).toBe(true);

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

		const roomSearch = await api('chat/messages/search', { query: 'hello room', roomId }, alice);
		expect(roomSearch.status).toBe(200);
		expect(roomSearch.body.some((item) => item.id === message.body.id)).toBe(true);

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

		const deniedDelete = await api('chat/rooms/delete', { roomId }, bob);
		expect(deniedDelete.status).toBe(400);
		expect(castAsError(deniedDelete.body).error.id).toBe('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');

		const remove = await api('chat/rooms/delete', { roomId }, alice);
		expect(remove.status).toBe(204);
	});

	test('条件付きのモデレーターロールは、ユーザー本人の値で判定してからルームの閲覧・削除を許す', async () => {
		// フォロワーが 1,000 人を超えるユーザーだけをモデレーターにする。carol (フォロワー 0) は該当しない。
		const moderatorRole = await role(alice, {
			isModerator: true,
			target: 'conditional',
			condFormula: {
				id: 'f0b6a2f4-3b1e-4b5a-9b0d-6a2f0c1e7d11',
				type: 'not',
				value: { id: '4d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d', type: 'followersLessThanOrEq', value: 1000 },
			} as never,
		});
		expect(moderatorRole.id).toBeTypeOf('string');

		const room = await api('chat/rooms/create', { name: 'moderation check room' }, alice);
		expect(room.status).toBe(200);

		const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id, limit: 10 }, carol);
		expect(timeline.status).toBe(400);
		expect(castAsError(timeline.body as any).error.code).toBe('NO_SUCH_ROOM');
		const remove = await api('chat/rooms/delete', { roomId: room.body.id }, carol);
		expect(remove.status).toBe(400);
		const show = await api('chat/rooms/show', { roomId: room.body.id }, alice);
		expect(show.status).toBe(200);
	});
});
