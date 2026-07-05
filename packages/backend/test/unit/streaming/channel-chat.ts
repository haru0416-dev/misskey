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
import { createChatRoomForHonoApi } from '@/server/rest/chat.js';
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

describe('hono-stream-connection: chat channels', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoStreamConnectionDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = runtime;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('chatUser: 接続してchatUserStreamイベントを受け取れる', async () => {
		const me = await createTestUser(deps, 'honostreamchatuserme');
		const other = await createTestUser(deps, 'honostreamchatuserother');
		const connection = new HonoStreamConnection(deps, me, null);
		await connection.init();

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { otherId: other.id }, 'chatUser', true);
		expect(raw.some(r => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit(`chatUserStream:${me.id}-${other.id}`, { type: 'message', body: { text: 'hi' } });

		const channelMessages = raw.map(r => JSON.parse(r)).filter(m => m.type === 'channel');
		expect(channelMessages.length).toBe(1);
		expect(channelMessages[0].body.body).toEqual({ text: 'hi' });
	});

	test('chatUser: otherIdが自分自身だと接続できない', async () => {
		const me = await createTestUser(deps, 'honostreamchatuserself');
		const connection = new HonoStreamConnection(deps, me, null);
		await connection.init();

		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', { otherId: me.id }, 'chatUser', true);
		expect(raw.length).toBe(0);
	});

	test('chatRoom: ルームオーナーは接続してchatRoomStreamイベントを受け取れる', async () => {
		const owner = await createTestUser(deps, 'honostreamchatroomowner');
		const connection = new HonoStreamConnection(deps, owner, null);
		await connection.init();
		const room = await createChatRoomForHonoApi(deps, owner, { name: 'test room' });

		const subscriber = new EventEmitter();
		const { raw, send } = collectSentMessages();
		connection.listen(subscriber, send);

		await connection.connectChannel('conn1', { roomId: room.id }, 'chatRoom', true);
		expect(raw.some(r => JSON.parse(r).type === 'connected')).toBe(true);

		subscriber.emit(`chatRoomStream:${room.id}`, { type: 'message', body: { text: 'hello room' } });

		const channelMessages = raw.map(r => JSON.parse(r)).filter(m => m.type === 'channel');
		expect(channelMessages.length).toBe(1);
		expect(channelMessages[0].body.body).toEqual({ text: 'hello room' });
	});

	test('chatRoom: 権限のないユーザーは接続できない', async () => {
		const owner = await createTestUser(deps, 'honostreamchatroomowner2');
		const stranger = await createTestUser(deps, 'honostreamchatroomstranger');
		const room = await createChatRoomForHonoApi(deps, owner, { name: 'private room' });

		const connection = new HonoStreamConnection(deps, stranger, null);
		await connection.init();

		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', { roomId: room.id }, 'chatRoom', true);
		expect(raw.length).toBe(0);
	});

	test('chatRoom: 存在しないルームIDでは接続できない', async () => {
		const me = await createTestUser(deps, 'honostreamchatroomnoroom');
		const connection = new HonoStreamConnection(deps, me, null);
		await connection.init();

		const { raw, send } = collectSentMessages();
		connection.listen(new EventEmitter(), send);

		await connection.connectChannel('conn1', { roomId: genId(deps.config) }, 'chatRoom', true);
		expect(raw.length).toBe(0);
	});
});
