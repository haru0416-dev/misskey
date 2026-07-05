/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { HonoStreamConnection, type HonoStreamConnectionDependencies } from '@/server/streaming/connection.js';
import type { MiUser } from '@/models/User.js';

async function createTestUser(deps: HonoStreamConnectionDependencies, prefix: string): Promise<MiUser> {
	const id = genId(deps.config);
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
	let deps: HonoStreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('未ログインではrequireCredentialなチャンネルに接続できない', async () => {
		const connection = new HonoStreamConnection(deps, null, null);
		await connection.init();

		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', {}, 'admin', true);
		// requireCredential のため 'connected' 応答は送られない
		expect(raw.length).toBe(0);
	});

	test('admin channel: 接続してadminStreamイベントを受け取れる', async () => {
		const user = await createTestUser(deps, 'honostreamadmin');
		const connection = new HonoStreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'admin', true);
		expect(raw.some(r => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit(`adminStream:${user.id}`, { type: 'test', body: { hello: 'world' } });

		const channelMessages = raw.map(r => JSON.parse(r)).filter(m => m.type === 'channel');
		expect(channelMessages.length).toBe(1);
		expect(channelMessages[0].body.id).toBe('conn1');
		expect(channelMessages[0].body.type).toBe('test');
		expect(channelMessages[0].body.body).toEqual({ hello: 'world' });
	});

	test('drive channel: 切断後はdriveStreamイベントを受け取らない', async () => {
		const user = await createTestUser(deps, 'honostreamdrive');
		const connection = new HonoStreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'drive', false);
		connection.disconnectChannel('conn1');

		subscriber.emit(`driveStream:${user.id}`, { type: 'test', body: {} });

		const channelMessages = raw.map(r => JSON.parse(r)).filter(m => m.type === 'channel');
		expect(channelMessages.length).toBe(0);
	});

	test('存在しないチャンネル名を要求すると例外になる', async () => {
		const user = await createTestUser(deps, 'honostreamunknown');
		const connection = new HonoStreamConnection(deps, user, null);
		await connection.init();

		connection.listen(new EventEmitter(), () => {});

		await expect(connection.connectChannel('conn1', {}, 'noSuchChannel', false)).rejects.toThrow('no such channel');
	});

	test('noteStream 購読: 公開範囲がfollowersかつ非フォロワーには配信しない', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer');
		const author = await createTestUser(deps, 'honostreamauthor');
		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'note1' } }));

		subscriber.emit('noteStream:note1', {
			type: 'updated',
			body: { id: 'note1', userId: author.id, visibility: 'followers', body: { text: 'secret' } },
		});

		expect(raw.length).toBe(0);
	});

	test('noteStream 購読: 公開範囲がpublicなら配信される', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer2');
		const author = await createTestUser(deps, 'honostreamauthor2');
		const connection = new HonoStreamConnection(deps, viewer, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		connection.handleClientMessage(JSON.stringify({ type: 'subNote', body: { id: 'note2' } }));

		subscriber.emit('noteStream:note2', {
			type: 'updated',
			body: { id: 'note2', userId: author.id, visibility: 'public', body: { text: 'hello' } },
		});

		const noteUpdated = raw.map(r => JSON.parse(r)).filter(m => m.type === 'noteUpdated');
		expect(noteUpdated.length).toBe(1);
		expect(noteUpdated[0].body.id).toBe('note2');
	});

	test('unsubNote 後は noteStream イベントを受け取らない', async () => {
		const viewer = await createTestUser(deps, 'honostreamviewer3');
		const author = await createTestUser(deps, 'honostreamauthor3');
		const connection = new HonoStreamConnection(deps, viewer, null);
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

		expect(raw.length).toBe(0);
	});

	test('broadcast イベントはそのままクライアントへ送られる', async () => {
		const connection = new HonoStreamConnection(deps, null, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		subscriber.emit('broadcast', { type: 'emojiAdded', body: { foo: 'bar' } });

		expect(raw.length).toBe(1);
		const parsed = JSON.parse(raw[0]!);
		expect(parsed.type).toBe('emojiAdded');
		expect(parsed.body).toEqual({ foo: 'bar' });
	});

	test('dispose 後はチャンネルのイベントを受け取らない', async () => {
		const user = await createTestUser(deps, 'honostreamdispose');
		const connection = new HonoStreamConnection(deps, user, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', {}, 'admin', false);
		connection.dispose();

		subscriber.emit(`adminStream:${user.id}`, { type: 'test', body: {} });

		const channelMessages = raw.map(r => JSON.parse(r)).filter(m => m.type === 'channel');
		expect(channelMessages.length).toBe(0);
	});
});
