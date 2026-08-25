/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createNoteInDatabase } from '@/core/NoteStore.js';
import { createFollowingInDatabase } from '@/core/FollowingStore.js';
import { createChannelInDatabase } from '@/core/ChannelStore.js';
import { createUserListInDatabase } from '@/core/UserListStore.js';
import { createUserListMembershipInDatabase } from '@/core/UserListMembershipStore.js';
import { createAntennaInDatabase } from '@/core/AntennaStore.js';
import { createRoleInDatabase } from '@/core/RoleStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { packNoteForHonoApi } from '@/server/rest/note.js';
import { HonoStreamConnection, type HonoStreamConnectionDependencies } from '@/server/streaming/connection.js';
import type { MiUser } from '@/models/User.js';

async function createTestUser(deps: HonoStreamConnectionDependencies, prefix: string): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
		profile: { userId: id },
	});
}

async function createTestRemoteUser(
	deps: HonoStreamConnectionDependencies,
	prefix: string,
	host: string,
): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase(), host },
		profile: { userId: id },
	});
}

function collectSentMessages(): { raw: string[]; send: (raw: string) => void } {
	const raw: string[] = [];
	return { raw, send: (r: string) => raw.push(r) };
}

function channelMessages(raw: string[]): { id: string; type: string; body: unknown }[] {
	return raw
		.map((r) => JSON.parse(r))
		.filter((m) => m.type === 'channel')
		.map((m) => m.body);
}

// notesStream ハンドラは内部で filterNoteForStreamingHidingForHonoApi 等の実DBクエリを await するため、
// emit() 呼び出し直後の同期チェックでは間に合わない。条件を満たすまで短時間ポーリングする。
async function waitUntil(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeoutMs) return;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
}

// 「受信されない」ことを検証するテスト用: 非同期処理が(誤って)完了していないか一定時間待ってから確認する。
async function shortDelay(ms = 300): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('hono-stream-connection: note filtering channels', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoStreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('hashtag: マッチするタグの公開ノートを受け取る', async () => {
		const viewer = await createTestUser(deps, 'honostreamhashtagviewer');
		const author = await createTestUser(deps, 'honostreamhashtagauthor');
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: '#foo hello',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			tags: ['foo'],
		});
		const packed = await packNoteForHonoApi(deps, noteId, viewer);

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { q: [['foo']] }, 'hashtag', false);
		subscriber.emit('notesStream', packed);
		await waitUntil(() => channelMessages(raw).length > 0);

		const messages = channelMessages(raw);
		expect(messages.length).toBe(1);
	});

	test('hashtag: マッチしないタグのノートは受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamhashtagviewer2');
		const author = await createTestUser(deps, 'honostreamhashtagauthor2');
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: '#bar hello',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			tags: ['bar'],
		});
		const packed = await packNoteForHonoApi(deps, noteId, viewer);

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { q: [['foo']] }, 'hashtag', false);
		subscriber.emit('notesStream', packed);
		await shortDelay();

		expect(channelMessages(raw).length).toBe(0);
	});

	test('channel (misskeyチャンネル): 指定したchannelIdのノートのみ受け取る', async () => {
		const viewer = await createTestUser(deps, 'honostreamchannelviewer');
		const author = await createTestUser(deps, 'honostreamchannelauthor');
		const mkChannelId = genId();
		await createChannelInDatabase(deps.db, { id: mkChannelId, name: 'test channel', userId: author.id });
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'in channel',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			channelId: mkChannelId,
		});
		const packed = await packNoteForHonoApi(deps, noteId, viewer);

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { channelId: mkChannelId }, 'channel', false);
		subscriber.emit('notesStream', packed);
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw).length).toBe(1);
	});

	test('channel (misskeyチャンネル): 異なるchannelIdのノートは受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamchannelviewer2');
		const author = await createTestUser(deps, 'honostreamchannelauthor2');
		const mkChannelId = genId();
		const otherChannelId = genId();
		await createChannelInDatabase(deps.db, { id: mkChannelId, name: 'test channel 2', userId: author.id });
		await createChannelInDatabase(deps.db, { id: otherChannelId, name: 'test channel 3', userId: author.id });
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'in other channel',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			channelId: otherChannelId,
		});
		const packed = await packNoteForHonoApi(deps, noteId, viewer);

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { channelId: mkChannelId }, 'channel', false);
		subscriber.emit('notesStream', packed);
		await shortDelay();

		expect(channelMessages(raw).length).toBe(0);
	});

	test('userList: リストメンバーの投稿のみ受け取る', async () => {
		const owner = await createTestUser(deps, 'honostreamlistowner');
		const member = await createTestUser(deps, 'honostreamlistmember');
		const nonMember = await createTestUser(deps, 'honostreamlistnonmember');
		const listId = genId();
		await createUserListInDatabase(deps.db, { id: listId, name: 'test list', userId: owner.id });
		await createUserListMembershipInDatabase(deps.db, {
			id: genId(),
			userListId: listId,
			userId: member.id,
			userListUserId: owner.id,
		});

		const memberNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: memberNoteId,
			text: 'from member',
			userId: member.id,
			userHost: null,
			visibility: 'public',
		});
		const nonMemberNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: nonMemberNoteId,
			text: 'from non-member',
			userId: nonMember.id,
			userHost: null,
			visibility: 'public',
		});

		const connection = new HonoStreamConnection(deps, owner, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { listId }, 'userList', true);
		expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit('notesStream', await packNoteForHonoApi(deps, memberNoteId, owner));
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, nonMemberNoteId, owner));
		await waitUntil(() => channelMessages(raw).length > 0);

		const messages = channelMessages(raw);
		expect(messages.length).toBe(1);
	});

	test('localTimeline: ローカル公開ノートを受け取り、リモートノートは受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamltlviewer');
		const localAuthor = await createTestUser(deps, 'honostreamltlauthor');
		const remoteAuthor = await createTestRemoteUser(deps, 'honostreamltlremote', 'ltl-remote.example.com');

		const localNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: localNoteId,
			text: 'local public',
			userId: localAuthor.id,
			userHost: null,
			visibility: 'public',
		});
		const remoteNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: remoteNoteId,
			text: 'remote public',
			userId: remoteAuthor.id,
			userHost: remoteAuthor.host,
			visibility: 'public',
		});

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'localTimeline', false);
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, localNoteId, viewer));
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, remoteNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw).length).toBe(1);
	});

	test('globalTimeline: 公開ノートを受け取り、チャンネル投稿は受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamgtlviewer');
		const author = await createTestUser(deps, 'honostreamgtlauthor');
		const mkChannelId = genId();
		await createChannelInDatabase(deps.db, { id: mkChannelId, name: 'gtl test channel', userId: author.id });

		const publicNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: publicNoteId,
			text: 'public note',
			userId: author.id,
			userHost: null,
			visibility: 'public',
		});
		const channelNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: channelNoteId,
			text: 'channel note',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			channelId: mkChannelId,
		});

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'globalTimeline', false);
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, publicNoteId, viewer));
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, channelNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw).length).toBe(1);
	});

	test('homeTimeline: フォロー中ユーザーの投稿のみ受け取る', async () => {
		const viewer = await createTestUser(deps, 'honostreamhtlviewer');
		const followee = await createTestUser(deps, 'honostreamhtlfollowee');
		const stranger = await createTestUser(deps, 'honostreamhtlstranger');
		await createFollowingInDatabase(deps.db, { id: genId(), followerId: viewer.id, followeeId: followee.id });

		const followeeNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: followeeNoteId,
			text: 'from followee',
			userId: followee.id,
			userHost: null,
			visibility: 'public',
		});
		const strangerNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: strangerNoteId,
			text: 'from stranger',
			userId: stranger.id,
			userHost: null,
			visibility: 'public',
		});

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'homeTimeline', false);
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, followeeNoteId, viewer));
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, strangerNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw).length).toBe(1);
	});

	test('hybridTimeline: フォロー中ユーザー・ローカル公開ノートを受け取り、無関係リモートノートは受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamhybridviewer');
		const localStranger = await createTestUser(deps, 'honostreamhybridstranger');
		const remoteStranger = await createTestRemoteUser(deps, 'honostreamhybridremote', 'hybrid-remote.example.com');

		const localNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: localNoteId,
			text: 'local public unrelated',
			userId: localStranger.id,
			userHost: null,
			visibility: 'public',
		});
		const remoteNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: remoteNoteId,
			text: 'remote public unrelated',
			userId: remoteStranger.id,
			userHost: remoteStranger.host,
			visibility: 'public',
		});

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'hybridTimeline', false);
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, localNoteId, viewer));
		subscriber.emit('notesStream', await packNoteForHonoApi(deps, remoteNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		// ローカル公開ノートは無関係でも受信、リモート無関係ノートは受信しない
		expect(channelMessages(raw).length).toBe(1);
	});

	test('roleTimeline: isExplorableなロールの公開ノートを受け取る', async () => {
		const viewer = await createTestUser(deps, 'honostreamroletlviewer');
		const author = await createTestUser(deps, 'honostreamroletlauthor');
		const roleId = genId();
		await createRoleInDatabase(deps.db, {
			id: roleId,
			name: `honostreamroletlrole${roleId}`,
			description: '',
			updatedAt: new Date(),
			lastUsedAt: new Date(),
			isExplorable: true,
		});

		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'role timeline note',
			userId: author.id,
			userHost: null,
			visibility: 'public',
		});
		const packed = await packNoteForHonoApi(deps, noteId, viewer);

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { roleId }, 'roleTimeline', false);
		subscriber.emit(`roleTimelineStream:${roleId}`, { type: 'note', body: packed });
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw).length).toBe(1);
	});

	test('roleTimeline: isExplorableでないロールの投稿は受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamroletlviewer2');
		const author = await createTestUser(deps, 'honostreamroletlauthor2');
		const roleId = genId();
		await createRoleInDatabase(deps.db, {
			id: roleId,
			name: `honostreamroletlrole2${roleId}`,
			description: '',
			updatedAt: new Date(),
			lastUsedAt: new Date(),
			isExplorable: false,
		});

		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'role timeline note 2',
			userId: author.id,
			userHost: null,
			visibility: 'public',
		});
		const packed = await packNoteForHonoApi(deps, noteId, viewer);

		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { roleId }, 'roleTimeline', false);
		subscriber.emit(`roleTimelineStream:${roleId}`, { type: 'note', body: packed });
		await shortDelay();

		expect(channelMessages(raw).length).toBe(0);
	});

	test('antenna: アンテナ所有者は登録済みアンテナのノートを受け取る', async () => {
		const owner = await createTestUser(deps, 'honostreamantennaowner');
		const author = await createTestUser(deps, 'honostreamantennaauthor');
		const antennaId = genId();
		await createAntennaInDatabase(deps.db, {
			id: antennaId,
			lastUsedAt: new Date(),
			userId: owner.id,
			name: 'test antenna',
			src: 'all',
			withFile: false,
		});

		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'antenna matched note',
			userId: author.id,
			userHost: null,
			visibility: 'public',
		});

		const connection = new HonoStreamConnection(deps, owner, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { antennaId }, 'antenna', true);
		expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit(`antennaStream:${antennaId}`, { type: 'note', body: { id: noteId } });
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw).length).toBe(1);
	});

	test('antenna: 他人のアンテナには接続できない', async () => {
		const owner = await createTestUser(deps, 'honostreamantennaowner2');
		const stranger = await createTestUser(deps, 'honostreamantennastranger');
		const antennaId = genId();
		await createAntennaInDatabase(deps.db, {
			id: antennaId,
			lastUsedAt: new Date(),
			userId: owner.id,
			name: 'private antenna',
			src: 'all',
			withFile: false,
		});

		const connection = new HonoStreamConnection(deps, stranger, null);
		await connection.init();
		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', { antennaId }, 'antenna', true);
		expect(raw.length).toBe(0);
	});
});
