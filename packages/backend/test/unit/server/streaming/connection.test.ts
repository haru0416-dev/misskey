/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createChatRoomInDatabase } from '@/core/chat/chat-room-store.js';
import { createUserWithProfileAndPublickeyInDatabase, updateUserInDatabase } from '@/core/user/user-store.js';
import {
	createAccessTokenInDatabase,
	deleteAccessTokenByIdAndUserIdFromDatabase,
} from '@/core/app/access-token-store.js';
import { deserializeAccessToken } from '@/db/schema/access-token.js';
import { createStreamRuntime } from '@/server/streaming/runtime.js';
import { genId } from '@/misc/id/gen-id.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { createEventPublishers } from '@/core/events.js';
import { handleApiIRevokeToken } from '@/server/rest/auth/access-tokens.js';
import { StreamConnection, refreshStreamConnections } from '@/server/streaming/connection.js';
import type { StreamConnectionDependencies } from '@/server/streaming/connection.js';
import type { MiUser } from '@/models/User.js';

async function createTestUser(deps: StreamConnectionDependencies, prefix: string): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
		profile: { userId: id },
	});
}

function collectSentMessages(): { raw: string[]; send: (raw: string) => void } {
	const raw: string[] = [];
	return { raw, send: (r: string) => raw.push(r) };
}

describe('hono-stream-connection', () => {
	let runtime: RuntimeDependencies;
	let deps: StreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('失効通知は初期化中と upgrade 待ちでも資格接続を無効化する', async () => {
		const user = await createTestUser(deps, 'honostreamrevokeinit');
		for (const duringInitialization of [true, false]) {
			const subscriber = new EventEmitter();
			const connection = new StreamConnection(deps, user, null);
			const initializing = connection.init(subscriber);
			if (!duringInitialization) await initializing;
			subscriber.emit('internal', { type: 'userChangeSuspendedState', body: { id: user.id, isSuspended: true } });
			if (duringInitialization) await expect(initializing).rejects.toThrow();
			const terminate = vi.fn();
			const { raw, send } = collectSentMessages();
			connection.listen(subscriber, send, terminate);
			connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'secret' } }));
			await connection.connectChannel('new', {}, 'main', true);
			connection.sendMessageToWs('private', { text: 'secret' });
			expect(terminate).toHaveBeenCalledOnce();
			expect(raw).toEqual([]);
			expect(subscriber.listenerCount('noteStream:secret')).toBe(0);
		}
	});

	test.each(['tokenId', 'token'] as const)(
		'失効publish失敗は呼出元へ返し、%s再試行で旧接続を切断する',
		async (kind) => {
			const user = await createTestUser(deps, 'honostreamretrypublish');
			const token = deserializeAccessToken({
				id: genId(),
				userId: user.id,
				token: genId(),
				permission: ['read:account'],
				lastUsedAt: null,
				session: null,
				name: null,
				description: null,
				iconUrl: null,
				fetched: false,
			});
			await createAccessTokenInDatabase(deps.db, token);
			const subscriber = new EventEmitter();
			const connection = new StreamConnection(deps, user, token);
			await connection.init(subscriber);
			const terminate = vi.fn();
			const { raw, send } = collectSentMessages();
			connection.listen(subscriber, send, terminate);
			await connection.connectChannel('private', {}, 'main');
			let fail = true;
			const publishers = createEventPublishers({
				config: deps.config,
				publish: async (_host, payload) => {
					if (fail) {
						fail = false;
						throw new Error('injected publish rejection');
					}
					const event = JSON.parse(payload);
					subscriber.emit(event.channel, event.message);
				},
			});
			const params = kind === 'tokenId' ? { tokenId: token.id } : { token: token.token };
			await expect(handleApiIRevokeToken({ ...deps, ...publishers }, user, null, params)).rejects.toThrow(
				'injected publish rejection',
			);
			await handleApiIRevokeToken({ ...deps, ...publishers }, user, null, params);
			subscriber.emit(`mainStream:${user.id}`, { type: 'meUpdated', body: { id: user.id } });
			connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'secret' } }));
			expect(terminate).toHaveBeenCalledOnce();
			expect(raw).toEqual([]);
			expect(subscriber.listenerCount('noteStream:secret')).toBe(0);
		},
	);

	test('同時 token 再生成の古い通知でも失効を検出し、現行 native token は保持する', async () => {
		const user = await createTestUser(deps, 'honostreamrotationrace');
		const oldToken = generateNativeUserToken();
		const newToken = generateNativeUserToken();
		await updateUserInDatabase(deps.db, user.id, { token: oldToken });
		const subscriber = new EventEmitter();
		const stale = new StreamConnection(deps, { ...user, token: oldToken }, null);
		await stale.init(subscriber);
		const terminateStale = vi.fn();
		stale.listen(subscriber, () => {}, terminateStale);
		await updateUserInDatabase(deps.db, user.id, { token: newToken });
		const current = new StreamConnection(deps, { ...user, token: newToken }, null);
		await current.init(subscriber);
		const terminateCurrent = vi.fn();
		const { raw, send } = collectSentMessages();
		current.listen(subscriber, send, terminateCurrent);
		await current.connectChannel('private', {}, 'main');
		subscriber.emit('internal', {
			type: 'userTokenRegenerated',
			body: { id: user.id, oldToken: generateNativeUserToken(), newToken },
		});
		await vi.waitFor(() => expect(terminateStale).toHaveBeenCalledOnce());
		await current.refresh();
		expect(terminateCurrent).not.toHaveBeenCalled();
		subscriber.emit(`mainStream:${user.id}`, { type: 'meUpdated', body: { id: user.id } });
		expect(raw.map((message) => JSON.parse(message).body.body)).toEqual([{ id: user.id }]);
		current.dispose();
	});

	test('失効イベントを取りこぼしても refresh で DB の token と停止状態を照合する', async () => {
		const user = await createTestUser(deps, 'honostreamlostrevoke');
		for (const kind of ['access', 'native', 'suspension'] as const) {
			const nativeToken = generateNativeUserToken();
			await updateUserInDatabase(deps.db, user.id, { isSuspended: false, token: nativeToken });
			const token = deserializeAccessToken({
				id: genId(),
				userId: user.id,
				token: genId(),
				permission: ['read:account'],
				lastUsedAt: null,
				session: null,
				name: null,
				description: null,
				iconUrl: null,
				fetched: false,
			});
			await createAccessTokenInDatabase(deps.db, token);
			const connection = new StreamConnection(deps, { ...user, token: nativeToken }, kind === 'access' ? token : null);
			const subscriber = new EventEmitter();
			await connection.init(subscriber);
			const terminate = vi.fn();
			const { raw, send } = collectSentMessages();
			connection.listen(subscriber, send, terminate);
			await connection.connectChannel('private', {}, 'main');
			if (kind === 'access') {
				await deleteAccessTokenByIdAndUserIdFromDatabase(deps.db, token.id, user.id);
			} else {
				await updateUserInDatabase(
					deps.db,
					user.id,
					kind === 'native' ? { token: generateNativeUserToken() } : { isSuspended: true },
				);
			}
			await expect(connection.refresh()).rejects.toThrow();
			subscriber.emit(`mainStream:${user.id}`, { type: 'meUpdated', body: { id: user.id } });
			connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'secret' } }));
			expect(terminate).toHaveBeenCalledOnce();
			expect(raw).toEqual([]);
			expect(subscriber.listenerCount('noteStream:secret')).toBe(0);
		}
	});

	test('失効通知の Redis 接続が切れたら資格接続を切断し、再購読完了まで upgrade を認めない', async () => {
		const user = await createTestUser(deps, 'honostreamredisrevoke');
		let acknowledgeSubscription!: () => void;
		const redis = Object.assign(new EventEmitter(), {
			status: 'ready',
			subscribe: () =>
				new Promise<number>((resolve) => {
					acknowledgeSubscription = () => resolve(1);
				}),
		});
		// テスト対象は pub/sub ライフサイクルだけで、他の Redis 操作は使用しない。
		const streamRuntime = createStreamRuntime({ ...runtime, redisForSub: redis as typeof runtime.redisForSub });
		const authenticated = new StreamConnection(deps, user, null);
		const anonymous = new StreamConnection(deps, null, null);
		try {
			await streamRuntime.init(authenticated);
			await streamRuntime.init(anonymous);
			const terminateAuthenticated = vi.fn();
			const terminateAnonymous = vi.fn();
			streamRuntime.listen(authenticated, () => {}, terminateAuthenticated);
			streamRuntime.listen(anonymous, () => {}, terminateAnonymous);
			redis.status = 'reconnecting';
			redis.emit('close');
			expect(terminateAuthenticated).toHaveBeenCalledOnce();
			expect(terminateAnonymous).not.toHaveBeenCalled();
			await expect(streamRuntime.init(new StreamConnection(deps, user, null))).rejects.toThrow();
			redis.status = 'ready';
			redis.emit('ready');
			await expect(streamRuntime.init(new StreamConnection(deps, user, null))).rejects.toThrow();
			acknowledgeSubscription();
			await vi.waitFor(async () => {
				const replacement = new StreamConnection(deps, user, null);
				await streamRuntime.init(replacement);
				streamRuntime.release(replacement);
			});
		} finally {
			streamRuntime.dispose();
		}
	});

	test('未ログインではrequireCredentialなチャンネルに接続できない', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();

		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', {}, 'admin', true);
		// requireCredential のため 'connected' 応答は送られない
		expect(raw).toHaveLength(0);
	});

	test('admin channel: 接続してadminStreamイベントを受け取れる', async () => {
		const user = await createTestUser(deps, 'honostreamadmin');
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'admin', true);
		expect(raw.some((r) => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit(`adminStream:${user.id}`, { type: 'test', body: { hello: 'world' } });

		const channelMessages = raw.map((r) => JSON.parse(r)).filter((m) => m.type === 'channel');
		expect(channelMessages).toHaveLength(1);
		expect(channelMessages[0].body.id).toBe('conn1');
		expect(channelMessages[0].body.type).toBe('test');
		expect(channelMessages[0].body.body).toEqual({ hello: 'world' });
	});

	test('drive channel: 切断後はdriveStreamイベントを受け取らない', async () => {
		const user = await createTestUser(deps, 'honostreamdrive');
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'drive', false);
		connection.disconnectChannel('conn1');

		subscriber.emit(`driveStream:${user.id}`, { type: 'test', body: {} });

		const channelMessages = raw.map((r) => JSON.parse(r)).filter((m) => m.type === 'channel');
		expect(channelMessages).toHaveLength(0);
	});

	test('存在しないチャンネル名を要求すると例外になる', async () => {
		const user = await createTestUser(deps, 'honostreamunknown');
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		connection.listen(new EventEmitter(), () => {});

		await expect(connection.connectChannel('conn1', {}, 'noSuchChannel', false)).rejects.toThrow('no such channel');
	});

	test('noteStream 購読: 公開範囲がfollowersかつ非フォロワーには配信しない', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer');
		const author = await createTestUser(deps, 'honostreamauthor');
		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'note1' } }));

		subscriber.emit('noteStream:note1', {
			type: 'updated',
			body: { id: 'note1', userId: author.id, visibility: 'followers', body: { text: 'secret' } },
		});

		expect(raw).toHaveLength(0);
	});

	test('noteStream 購読: 公開範囲がpublicなら配信される', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer2');
		const author = await createTestUser(deps, 'honostreamauthor2');
		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'note2' } }));

		subscriber.emit('noteStream:note2', {
			type: 'updated',
			body: { id: 'note2', userId: author.id, visibility: 'public', body: { text: 'hello' } },
		});

		const noteUpdated = raw.map((r) => JSON.parse(r)).filter((m) => m.type === 'noteUpdated');
		expect(noteUpdated).toHaveLength(1);
		expect(noteUpdated[0].body.id).toBe('note2');
	});

	test('unsubNote 後は noteStream イベントを受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer3');
		const author = await createTestUser(deps, 'honostreamauthor3');
		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'note3' } }));
		connection.handleClientMessage(JSON.stringify({ type: 'unsubNote', body: { id: 'note3' } }));

		subscriber.emit('noteStream:note3', {
			type: 'updated',
			body: { id: 'note3', userId: author.id, visibility: 'public', body: {} },
		});

		expect(raw).toHaveLength(0);
	});

	test('同じノートを重ねて購読したときは、購読した回数だけ unsubNote されるまで外さない', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		connection.listen(subscriber, () => {});

		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'twice' } }));
		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'twice' } }));
		expect(subscriber.listenerCount('noteStream:twice')).toBe(1);
		connection.handleClientMessage(JSON.stringify({ type: 'unsubNote', body: { id: 'twice' } }));
		expect(subscriber.listenerCount('noteStream:twice')).toBe(1);
		connection.handleClientMessage(JSON.stringify({ type: 'unsubNote', body: { id: 'twice' } }));
		expect(subscriber.listenerCount('noteStream:twice')).toBe(0);
		connection.dispose();
	});

	test('編集の合図だけの購読 (se) には edited だけを送り、全体の購読 (sr) と数を分けて外す', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer4');
		const author = await createTestUser(deps, 'honostreamauthor4');
		const connection = new StreamConnection(deps, viewer, null);
		await connection.init();
		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);
		const emit = (type: string) =>
			subscriber.emit('noteStream:edits', {
				type,
				body: { id: 'edits', userId: author.id, visibility: 'public', body: {} },
			});
		const received = () =>
			raw
				.map((r) => JSON.parse(r))
				.filter((m) => m.type === 'noteUpdated')
				.map((m) => m.body.type);

		connection.handleClientMessage(JSON.stringify({ type: 'se', body: { id: 'edits' } }));
		emit('reacted');
		emit('edited');
		expect(received()).toEqual(['edited']);

		// 全体の購読が重なっている間はすべて送り、全体の購読を外すと edited だけに戻る。
		connection.handleClientMessage(JSON.stringify({ type: 'sr', body: { id: 'edits' } }));
		emit('reacted');
		connection.handleClientMessage(JSON.stringify({ type: 'un', body: { id: 'edits' } }));
		emit('reacted');
		expect(received()).toEqual(['edited', 'reacted']);
		expect(subscriber.listenerCount('noteStream:edits')).toBe(1);

		// 数の無い種類の解除は無視し、編集の購読は残す。
		connection.handleClientMessage(JSON.stringify({ type: 'un', body: { id: 'edits' } }));
		expect(subscriber.listenerCount('noteStream:edits')).toBe(1);
		connection.handleClientMessage(JSON.stringify({ type: 'ue', body: { id: 'edits' } }));
		expect(subscriber.listenerCount('noteStream:edits')).toBe(0);
		connection.dispose();
	});

	// 購読数に上限が無いと、1 接続 (匿名でも可) がプロセス共有の emitter に listener を際限なく積める。
	test('1 接続のノート購読は上限までで、超えた分は古い購読から外す', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		subscriber.setMaxListeners(0);
		connection.listen(subscriber, () => {});

		const total = 2000;
		for (let i = 0; i < total; i++) {
			connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: `n${i}` } }));
		}
		const subscribed = subscriber.eventNames().filter((name) => String(name).startsWith('noteStream:'));
		expect(subscribed).toHaveLength(1536);
		expect(subscriber.listenerCount('noteStream:n0')).toBe(0);
		expect(subscriber.listenerCount(`noteStream:n${total - 1}`)).toBe(1);

		connection.dispose();
		expect(subscriber.eventNames().filter((name) => String(name).startsWith('noteStream:'))).toHaveLength(0);
	});

	test('上限に達したら、編集の合図だけの購読から先に外す (全体の購読は古くても残す)', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();
		const subscriber = new EventEmitter();
		subscriber.setMaxListeners(0);
		connection.listen(subscriber, () => {});

		connection.handleClientMessage(JSON.stringify({ type: 'sr', body: { id: 'all0' } }));
		// 編集の合図だけで始めて全体の購読が重なったものは、全体の購読として残す。
		connection.handleClientMessage(JSON.stringify({ type: 'se', body: { id: 'mixed' } }));
		connection.handleClientMessage(JSON.stringify({ type: 'sr', body: { id: 'mixed' } }));
		for (let i = 0; i < 1534; i++) {
			connection.handleClientMessage(JSON.stringify({ type: 'se', body: { id: `e${i}` } }));
		}
		connection.handleClientMessage(JSON.stringify({ type: 'se', body: { id: 'overflow' } }));

		expect(subscriber.eventNames().filter((name) => String(name).startsWith('noteStream:'))).toHaveLength(1536);
		expect(subscriber.listenerCount('noteStream:all0')).toBe(1);
		expect(subscriber.listenerCount('noteStream:mixed')).toBe(1);
		expect(subscriber.listenerCount('noteStream:e0')).toBe(0);
		expect(subscriber.listenerCount('noteStream:e1')).toBe(1);
		expect(subscriber.listenerCount('noteStream:overflow')).toBe(1);
		connection.dispose();
	});

	test('broadcast イベントはそのままクライアントへ送られる', async () => {
		const connection = new StreamConnection(deps, null, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		subscriber.emit('broadcast', { type: 'emojiAdded', body: { foo: 'bar' } });

		expect(raw).toHaveLength(1);
		const parsed = JSON.parse(raw[0]!);
		expect(parsed.type).toBe('emojiAdded');
		expect(parsed.body).toEqual({ foo: 'bar' });
	});

	test('internal イベントで接続中の関係スナップショットを更新する', async () => {
		const user = await createTestUser(deps, 'honostreaminternal');
		const other = await createTestUser(deps, 'honostreaminternalother');
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		connection.listen(subscriber, () => {});
		const state = connection as unknown as {
			following: Record<string, { withReplies: boolean } | undefined>;
			followingChannels: Set<string>;
			mutingChannels: Set<string>;
			userIdsWhoMeMuting: Set<string>;
			userIdsWhoBlockingMe: Set<string>;
			userIdsWhoMeMutingRenotes: Set<string>;
			userMutedInstances: Set<string>;
		};

		subscriber.emit('internal', {
			type: 'follow',
			body: { followerId: user.id, followeeId: other.id, withReplies: true },
		});
		expect(state.following[other.id]).toEqual({ withReplies: true });
		subscriber.emit('internal', {
			type: 'followingUpdated',
			body: { followerId: user.id, followeeId: other.id, withReplies: false },
		});
		expect(state.following[other.id]).toEqual({ withReplies: false });
		subscriber.emit('internal', { type: 'followingsUpdated', body: { followerId: user.id, withReplies: true } });
		expect(state.following[other.id]).toEqual({ withReplies: true });

		subscriber.emit('internal', { type: 'followChannel', body: { userId: user.id, channelId: 'channel1' } });
		subscriber.emit('internal', { type: 'muteChannel', body: { userId: user.id, channelId: 'channel2' } });
		subscriber.emit('internal', { type: 'mute', body: { muterId: user.id, muteeId: other.id } });
		subscriber.emit('internal', { type: 'renoteMute', body: { muterId: user.id, muteeId: other.id } });
		subscriber.emit('internal', { type: 'blockingCreated', body: { blockerId: other.id, blockeeId: user.id } });
		subscriber.emit('internal', {
			type: 'updateUserProfile',
			body: { userId: user.id, mutedInstances: ['example.com'] },
		});

		expect(state.followingChannels).toContain('channel1');
		expect(state.mutingChannels).toContain('channel2');
		expect(state.userIdsWhoMeMuting).toContain(other.id);
		expect(state.userIdsWhoMeMutingRenotes).toContain(other.id);
		expect(state.userIdsWhoBlockingMe).toContain(other.id);
		expect(state.userMutedInstances).toEqual(new Set(['example.com']));

		subscriber.emit('internal', { type: 'unfollow', body: { followerId: user.id, followeeId: other.id } });
		subscriber.emit('internal', { type: 'unfollowChannel', body: { userId: user.id, channelId: 'channel1' } });
		subscriber.emit('internal', { type: 'unmuteChannel', body: { userId: user.id, channelId: 'channel2' } });
		subscriber.emit('internal', { type: 'unmute', body: { muterId: user.id, muteeId: other.id } });
		subscriber.emit('internal', { type: 'renoteUnmute', body: { muterId: user.id, muteeId: other.id } });
		subscriber.emit('internal', { type: 'blockingDeleted', body: { blockerId: other.id, blockeeId: user.id } });

		expect(state.following[other.id]).toBeUndefined();
		expect(state.followingChannels).not.toContain('channel1');
		expect(state.mutingChannels).not.toContain('channel2');
		expect(state.userIdsWhoMeMuting).not.toContain(other.id);
		expect(state.userIdsWhoMeMutingRenotes).not.toContain(other.id);
		expect(state.userIdsWhoBlockingMe).not.toContain(other.id);
	});

	test('初期スナップショット取得中のinternalイベントを取得後に再適用する', async () => {
		const user = await createTestUser(deps, 'honostreaminit');
		const other = await createTestUser(deps, 'honostreaminitother');
		const connection = new StreamConnection(deps, user, null);
		const subscriber = new EventEmitter();

		const initializing = connection.init(subscriber);
		subscriber.emit('internal', {
			type: 'follow',
			body: { followerId: user.id, followeeId: other.id, withReplies: true },
		});
		await initializing;

		const state = connection as unknown as {
			following: Record<string, { withReplies: boolean } | undefined>;
		};
		expect(state.following[other.id]).toEqual({ withReplies: true });
		connection.dispose();
	});

	test('dispose 後はチャンネルのイベントを受け取らない', async () => {
		const user = await createTestUser(deps, 'honostreamdispose');
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'admin', false);
		connection.dispose();

		subscriber.emit(`adminStream:${user.id}`, { type: 'test', body: {} });

		const channelMessages = raw.map((r) => JSON.parse(r)).filter((m) => m.type === 'channel');
		expect(channelMessages).toHaveLength(0);
	});

	test('チャンネル初期化中にdisposeしてもlistenerを残さない', async () => {
		const user = await createTestUser(deps, 'honostreamdisposeduringinit');
		const room = await createChatRoomInDatabase(deps.db, { id: genId(), ownerId: user.id, name: 'test room' });
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		connection.listen(subscriber, () => {});

		const connecting = connection.connectChannel('conn1', { roomId: room.id }, 'chatRoom', false);
		connection.dispose();
		await connecting;

		expect(subscriber.listenerCount(`chatRoomStream:${room.id}`)).toBe(0);
	});

	test('チャンネル初期化中にdisconnectしてもチャンネルを復活させない', async () => {
		const user = await createTestUser(deps, 'honostreamdisconnectduringinit');
		const room = await createChatRoomInDatabase(deps.db, { id: genId(), ownerId: user.id, name: 'test room' });
		const connection = new StreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		connection.listen(subscriber, () => {});

		const connecting = connection.connectChannel('conn1', { roomId: room.id }, 'chatRoom', false);
		connection.disconnectChannel('conn1');
		await connecting;

		expect(subscriber.listenerCount(`chatRoomStream:${room.id}`)).toBe(0);
	});

	test('Redis再接続後の再同期が失敗し続けた接続を切断する', async () => {
		const refresh = vi.fn().mockRejectedValue(new Error('database unavailable'));
		const terminate = vi.fn();
		const connection = { refresh } as unknown as StreamConnection;
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await refreshStreamConnections(new Map([[connection, terminate]]));
		} finally {
			consoleError.mockRestore();
		}

		expect(refresh).toHaveBeenCalledTimes(3);
		expect(terminate).toHaveBeenCalledOnce();
	});
});
