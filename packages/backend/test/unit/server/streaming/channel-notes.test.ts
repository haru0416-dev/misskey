/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/user-store.js';
import { createNoteInDatabase } from '@/core/note/note-store.js';
import { createDriveFileInDatabase } from '@/core/drive/drive-file-store.js';
import { createFollowingInDatabase } from '@/core/user/following-store.js';
import { createChannelInDatabase } from '@/core/channel/channel-store.js';
import { createUserListInDatabase } from '@/core/user/user-list-store.js';
import { createUserListMembershipInDatabase } from '@/core/user/user-list-membership-store.js';
import { createAntennaInDatabase } from '@/core/antenna/antenna-store.js';
import { createRoleInDatabase } from '@/core/role/role-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { filterNoteForStreamingHiding, packNote } from '@/core/note/note-packing.js';
import { StreamConnection } from '@/server/streaming/connection.js';
import type { StreamConnectionDependencies } from '@/server/streaming/connection.js';
import type { MiUser } from '@/models/User.js';
import type { Packed } from '@/misc/json-schema.js';

async function createTestUser(deps: StreamConnectionDependencies, prefix: string): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
		profile: { userId: id },
	});
}

async function createTestRemoteUser(deps: StreamConnectionDependencies, prefix: string, host: string): Promise<MiUser> {
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

function channelNoteIds(raw: string[]): string[] {
	return channelMessages(raw)
		.filter((message) => message.type === 'note')
		.map((message) => {
			const body = message.body;
			if (body == null || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
				throw new Error('Invalid note stream message');
			}
			return body.id;
		});
}

// notesStream ハンドラは内部で filterNoteForStreamingHiding 等の実DBクエリを await するため、
// emit() 呼び出し直後の同期チェックでは間に合わない。条件を満たすまで短時間ポーリングする。
async function waitUntil(condition: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
	await vi.waitFor(() => expect(condition()).toBe(true), { timeout: timeoutMs, interval: intervalMs });
}

// 「受信されない」ことを検証するテスト用: 非同期処理が(誤って)完了していないか一定時間待ってから確認する。
async function shortDelay(ms = 300): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('hono-stream-connection: note filtering channels', () => {
	let runtime: RuntimeDependencies;
	let deps: StreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('hashtag: マッチするタグのみ同じ接続で受け取る', async () => {
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
		const otherNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: otherNoteId,
			text: '#bar hello',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			tags: ['bar'],
		});
		const otherPacked = await packNote(deps, otherNoteId, viewer);
		const packed = await packNote(deps, noteId, viewer);

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { q: [['foo']] }, 'hashtag', false);
		subscriber.emit('notesStream', otherPacked);
		subscriber.emit('notesStream', packed);
		await waitUntil(() => channelNoteIds(raw).includes(noteId));
		await shortDelay();

		expect(channelNoteIds(raw)).toEqual([noteId]);
		connection.dispose();
	});

	test('hashtag: 問い合わせは正規化して照合する', async () => {
		const viewer = await createTestUser(deps, 'honostreamhashtagviewer3');
		const author = await createTestUser(deps, 'honostreamhashtagauthor3');
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: '#foo hello',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			tags: ['foo'],
		});
		const packed = await packNote(deps, noteId, viewer);

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		// 全角・大文字の問い合わせも NFKC と小文字化で投稿のタグと一致する。
		await connection.connectChannel('conn1', { q: [['ＦＯＯ']] }, 'hashtag', false);
		subscriber.emit('notesStream', packed);
		await waitUntil(() => channelMessages(raw).length > 0);
		expect(channelMessages(raw)).toHaveLength(1);
	});

	test('hashtag: 大きすぎる問い合わせでは接続しない', async () => {
		const viewer = await createTestUser(deps, 'honostreamhashtagviewer4');
		for (const q of [
			Array.from({ length: 101 }, () => ['a']),
			[Array.from({ length: 11 }, () => 'a')],
			[['a'.repeat(129)]],
		]) {
			const connection = new StreamConnection(deps, viewer, null);
			await connection.init();
			const { raw, send } = collectSentMessages();
			connection.listen(new EventEmitter(), send);
			await connection.connectChannel('conn1', { q }, 'hashtag', true);
			expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(false);
			connection.dispose();
		}
		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);
		await connection.connectChannel('conn1', { q: Array.from({ length: 100 }, () => ['a']) }, 'hashtag', true);
		expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(true);
		connection.dispose();
	});

	test.each(['reply', 'quote', 'quotedReply', 'renotedReply'] as const)(
		'hashtag: %s の非公開埋め込みを隠し、別の閲覧者には元の内容を届ける',
		async (kind) => {
			const author = await createTestUser(deps, 'streamprivateauthor');
			const recipient = await createTestUser(deps, 'streamprivaterecipient');
			const viewer = await createTestUser(deps, 'streamprivateviewer');
			const fileId = genId();
			await createDriveFileInDatabase(deps.db, {
				id: fileId,
				userId: author.id,
				md5: '00000000000000000000000000000000',
				name: 'private.txt',
				type: 'text/plain',
				size: 7,
				url: `${runtime.config.instance.url}/files/${fileId}`,
				properties: {},
				isLink: true,
				storedInternal: false,
			});
			const privateId = genId();
			await createNoteInDatabase(deps.db, {
				id: privateId,
				text: 'private body',
				cw: 'private warning',
				userId: author.id,
				visibility: 'specified',
				visibleUserIds: [recipient.id],
				fileIds: [fileId],
			});
			const childId = genId();
			await createNoteInDatabase(deps.db, {
				id: childId,
				text: '#privateembedded visible child',
				tags: ['privateembedded'],
				userId: recipient.id,
				visibility: 'specified',
				visibleUserIds: [author.id, viewer.id],
				...(kind === 'quote' ? { renoteId: privateId } : { replyId: privateId, replyUserId: author.id }),
			});
			let noteId = childId;
			if (kind === 'quotedReply' || kind === 'renotedReply') {
				noteId = genId();
				await createNoteInDatabase(deps.db, {
					id: noteId,
					text: kind === 'renotedReply' ? null : '#privateembedded visible quote',
					tags: ['privateembedded'],
					userId: recipient.id,
					visibility: 'specified',
					visibleUserIds: [author.id, viewer.id],
					renoteId: childId,
				});
			}
			const packed = await packNote(deps, noteId, null, { skipHide: true });
			const subscriber = new EventEmitter();
			const hiddenMessages = collectSentMessages();
			const visibleMessages = collectSentMessages();
			const hiddenConnection = new StreamConnection(deps, viewer, null);
			const visibleConnection = new StreamConnection(deps, author, null);
			try {
				await hiddenConnection.init();
				await visibleConnection.init();
				hiddenConnection.listen(subscriber, hiddenMessages.send);
				visibleConnection.listen(subscriber, visibleMessages.send);
				await hiddenConnection.connectChannel('hidden', { q: [['privateembedded']] }, 'hashtag', false);
				await visibleConnection.connectChannel('visible', { q: [['privateembedded']] }, 'hashtag', false);
				subscriber.emit('notesStream', packed);
				await waitUntil(
					() =>
						channelNoteIds(hiddenMessages.raw).includes(noteId) && channelNoteIds(visibleMessages.raw).includes(noteId),
				);
				const hidden = channelMessages(hiddenMessages.raw).find((message) => message.type === 'note')!
					.body as Packed<'Note'>;
				const visible = channelMessages(visibleMessages.raw).find((message) => message.type === 'note')!
					.body as Packed<'Note'>;
				const embedded = (note: Packed<'Note'>) =>
					kind === 'quote'
						? note.renote
						: kind === 'quotedReply' || kind === 'renotedReply'
							? note.renote?.reply
							: note.reply;
				expect(hidden.text).toBe(packed.text);
				expect(embedded(hidden)).toMatchObject({
					id: privateId,
					text: null,
					cw: null,
					isHidden: true,
					files: [],
					fileIds: [],
				});
				expect(embedded(hidden)?.visibleUserIds).toBeUndefined();
				expect(embedded(visible)).toMatchObject({
					id: privateId,
					text: 'private body',
					cw: 'private warning',
					fileIds: [fileId],
					files: [expect.objectContaining({ id: fileId, name: 'private.txt' })],
				});
			} finally {
				hiddenConnection.dispose();
				visibleConnection.dispose();
			}
		},
	);

	test('閲覧できない投稿の純粋リノートは配送せず、作者には元の本文を届ける', async () => {
		const author = await createTestUser(deps, 'streamrenoteauthor');
		const viewer = await createTestUser(deps, 'streamrenoteviewer');
		const privateId = genId();
		await createNoteInDatabase(deps.db, {
			id: privateId,
			text: 'private renote body',
			userId: author.id,
			visibility: 'specified',
			visibleUserIds: [],
		});
		const renoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: renoteId,
			userId: author.id,
			renoteId: privateId,
			visibility: 'public',
		});
		const packed = await packNote(deps, renoteId, null, { skipHide: true });
		expect(await filterNoteForStreamingHiding(deps, packed, viewer.id)).toBeNull();
		expect(await filterNoteForStreamingHiding(deps, packed, author.id)).toMatchObject({
			id: renoteId,
			renote: { id: privateId, text: 'private renote body' },
		});
	});

	test('channel (misskeyチャンネル): 指定したchannelIdのノートのみ同じ接続で受け取る', async () => {
		const viewer = await createTestUser(deps, 'honostreamchannelviewer');
		const author = await createTestUser(deps, 'honostreamchannelauthor');
		const mkChannelId = genId();
		await createChannelInDatabase(deps.db, { id: mkChannelId, name: 'test channel', userId: author.id });
		const otherChannelId = genId();
		await createChannelInDatabase(deps.db, { id: otherChannelId, name: 'other channel', userId: author.id });
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'in channel',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			channelId: mkChannelId,
		});
		const otherNoteId = genId();
		await createNoteInDatabase(deps.db, {
			id: otherNoteId,
			text: 'in other channel',
			userId: author.id,
			userHost: null,
			visibility: 'public',
			channelId: otherChannelId,
		});
		const otherPacked = await packNote(deps, otherNoteId, viewer);
		const packed = await packNote(deps, noteId, viewer);

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { channelId: mkChannelId }, 'channel', false);
		subscriber.emit('notesStream', otherPacked);
		subscriber.emit('notesStream', packed);
		await waitUntil(() => channelNoteIds(raw).includes(noteId));
		await shortDelay();

		expect(channelNoteIds(raw)).toEqual([noteId]);
		connection.dispose();
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

		const connection = new StreamConnection(deps, owner, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { listId }, 'userList', true);
		expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit('notesStream', await packNote(deps, memberNoteId, owner));
		subscriber.emit('notesStream', await packNote(deps, nonMemberNoteId, owner));
		await waitUntil(() => channelMessages(raw).length > 0);

		const messages = channelMessages(raw);
		expect(messages).toHaveLength(1);
		// メンバーを周期的に読み直すタイマーを止める。残すと DB を閉じた後も読み続ける。
		connection.dispose();
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

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'localTimeline', false);
		subscriber.emit('notesStream', await packNote(deps, localNoteId, viewer));
		subscriber.emit('notesStream', await packNote(deps, remoteNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw)).toHaveLength(1);
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

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'globalTimeline', false);
		subscriber.emit('notesStream', await packNote(deps, publicNoteId, viewer));
		subscriber.emit('notesStream', await packNote(deps, channelNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw)).toHaveLength(1);
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

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'homeTimeline', false);
		subscriber.emit('notesStream', await packNote(deps, followeeNoteId, viewer));
		subscriber.emit('notesStream', await packNote(deps, strangerNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw)).toHaveLength(1);
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

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'hybridTimeline', false);
		subscriber.emit('notesStream', await packNote(deps, localNoteId, viewer));
		subscriber.emit('notesStream', await packNote(deps, remoteNoteId, viewer));
		await waitUntil(() => channelMessages(raw).length > 0);

		// ローカル公開ノートは無関係でも受信、リモート無関係ノートは受信しない
		expect(channelMessages(raw)).toHaveLength(1);
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
		const packed = await packNote(deps, noteId, viewer);

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { roleId }, 'roleTimeline', false);
		subscriber.emit(`roleTimelineStream:${roleId}`, { type: 'note', body: packed });
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw)).toHaveLength(1);
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
		const packed = await packNote(deps, noteId, viewer);

		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { roleId }, 'roleTimeline', false);
		subscriber.emit(`roleTimelineStream:${roleId}`, { type: 'note', body: packed });
		await shortDelay();

		expect(channelMessages(raw)).toHaveLength(0);
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

		const connection = new StreamConnection(deps, owner, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { antennaId }, 'antenna', true);
		expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit(`antennaStream:${antennaId}`, { type: 'note', body: { id: noteId } });
		await waitUntil(() => channelMessages(raw).length > 0);

		expect(channelMessages(raw)).toHaveLength(1);
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

		const connection = new StreamConnection(deps, stranger, null);
		await connection.init();
		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', { antennaId }, 'antenna', true);
		expect(raw).toHaveLength(0);
	});
});
