/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createChatMessageInDatabase, listRoomChatHistoryFromDatabase, listUserChatHistoryFromDatabase } from '@/core/ChatMessageStore.js';
import { createChatRoomInDatabase, createChatRoomMembershipInDatabase } from '@/core/ChatRoomStore.js';
import { createMutingInDatabase } from '@/core/MutingStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiUser } from '@/models/User.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';

describe('ChatMessageStore history', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createUser(prefix: string): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `chathistory${prefix}${id}`, usernameLower: `chathistory${prefix}${id}` },
			profile: { userId: id },
		});
	}

	test('returns the latest message per user after deduplication and excludes muted users', async () => {
		const [viewer, alice, bob, carol, muted] = await Promise.all([
			createUser('viewer'),
			createUser('alice'),
			createUser('bob'),
			createUser('carol'),
			createUser('muted'),
		]);
		await createMutingInDatabase(runtime.db, {
			id: genId(),
			muterId: viewer.id,
			muteeId: muted.id,
			// Chat history preserves the existing behavior until the expiry cleanup removes this row.
			expiresAt: new Date(0),
		});

		const base = Date.now() - 10_000;
		const bobLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 1),
			fromUserId: viewer.id,
			toUserId: bob.id,
			text: 'bob latest outgoing',
		});
		const carolLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 2),
			fromUserId: carol.id,
			toUserId: viewer.id,
			text: 'carol latest',
		});
		const aliceOld = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 3),
			fromUserId: viewer.id,
			toUserId: alice.id,
			text: 'alice old',
		});
		const aliceLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 4),
			fromUserId: alice.id,
			toUserId: viewer.id,
			text: 'alice latest',
		});
		await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 5),
			fromUserId: muted.id,
			toUserId: viewer.id,
			text: 'muted incoming',
		});
		await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 6),
			fromUserId: viewer.id,
			toUserId: muted.id,
			text: 'muted outgoing',
		});

		const limited = await listUserChatHistoryFromDatabase(runtime.db, viewer.id, 2);
		const all = await listUserChatHistoryFromDatabase(runtime.db, viewer.id, 10);

		expect(limited.map(message => message.id)).toEqual([aliceLatest.id, carolLatest.id]);
		expect(all.map(message => message.id)).toEqual([aliceLatest.id, carolLatest.id, bobLatest.id]);
		expect(all.some(message => message.id === aliceOld.id)).toBe(false);
	});

	test('returns the latest message for owned and joined rooms in global newest order', async () => {
		const [viewer, owner, sender] = await Promise.all([
			createUser('roomviewer'),
			createUser('roomowner'),
			createUser('roomsender'),
		]);
		const ownedRoom = await createChatRoomInDatabase(runtime.db, { id: genId(), ownerId: viewer.id, name: 'owned' });
		const memberRoom = await createChatRoomInDatabase(runtime.db, { id: genId(), ownerId: owner.id, name: 'member' });
		const ownedAndJoinedRoom = await createChatRoomInDatabase(runtime.db, { id: genId(), ownerId: viewer.id, name: 'owned and joined' });
		const inaccessibleRoom = await createChatRoomInDatabase(runtime.db, { id: genId(), ownerId: owner.id, name: 'inaccessible' });
		await Promise.all([
			createChatRoomMembershipInDatabase(runtime.db, { id: genId(), userId: viewer.id, roomId: memberRoom.id, isMuted: true }),
			createChatRoomMembershipInDatabase(runtime.db, { id: genId(), userId: viewer.id, roomId: ownedAndJoinedRoom.id }),
		]);

		const base = Date.now() - 5_000;
		const memberLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 1),
			fromUserId: sender.id,
			toRoomId: memberRoom.id,
			text: 'member latest',
		});
		const ownedAndJoinedLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 2),
			fromUserId: sender.id,
			toRoomId: ownedAndJoinedRoom.id,
			text: 'owned and joined latest',
		});
		await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 3),
			fromUserId: sender.id,
			toRoomId: ownedRoom.id,
			text: 'owned old',
		});
		const ownedLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 4),
			fromUserId: sender.id,
			toRoomId: ownedRoom.id,
			text: 'owned latest',
		});
		const inaccessibleLatest = await createChatMessageInDatabase(runtime.db, {
			id: genId(base + 5),
			fromUserId: sender.id,
			toRoomId: inaccessibleRoom.id,
			text: 'inaccessible latest',
		});

		const limited = await listRoomChatHistoryFromDatabase(runtime.db, viewer.id, 2);
		const all = await listRoomChatHistoryFromDatabase(runtime.db, viewer.id, 10);

		expect(limited.map(message => message.id)).toEqual([ownedLatest.id, ownedAndJoinedLatest.id]);
		expect(all.map(message => message.id)).toEqual([ownedLatest.id, ownedAndJoinedLatest.id, memberLatest.id]);
		expect(all.some(message => message.id === inaccessibleLatest.id)).toBe(false);
	});

	test('returns empty histories when there are no conversations or eligible rooms', async () => {
		const viewer = await createUser('empty');

		expect(await listUserChatHistoryFromDatabase(runtime.db, viewer.id, 10)).toEqual([]);
		expect(await listRoomChatHistoryFromDatabase(runtime.db, viewer.id, 10)).toEqual([]);
	});
});
