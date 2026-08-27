/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { emitStreamRedisMessage } from '@/server/streaming/server.js';

// この関数は ioredis の 'message' リスナーとして同期的に呼ばれるため、
// 投げた例外は誰も捕捉できずストリーミングサーバーのプロセスごと落とす
describe('emitStreamRedisMessage', () => {
	test('正しい payload は channel 名のイベントとして配る', () => {
		const ev = new EventEmitter();
		const listener = vi.fn();
		ev.on('example.com', listener);

		emitStreamRedisMessage(ev, JSON.stringify({ channel: 'example.com', message: { type: 'note', body: 1 } }));

		expect(listener).toHaveBeenCalledWith({ type: 'note', body: 1 });
	});

	test.each([
		['JSONとして壊れている', '{'],
		['null', 'null'],
		['配列', '[1,2,3]'],
		['文字列', '"hello"'],
		['channel が無い', '{"message":{}}'],
		['channel が文字列でない', '{"channel":123,"message":{}}'],
		['channel が空文字', '{"channel":"","message":{}}'],
	])('%s payload では throw しない', (_label, data) => {
		const ev = new EventEmitter();
		expect(() => emitStreamRedisMessage(ev, data)).not.toThrow();
	});

	test("channel が 'error' でも throw しない (listener の無い error イベントは EventEmitter が throw する)", () => {
		const ev = new EventEmitter();
		const listener = vi.fn();
		ev.on('example.com', listener);

		expect(() => emitStreamRedisMessage(ev, JSON.stringify({ channel: 'error', message: {} }))).not.toThrow();
		expect(listener).not.toHaveBeenCalled();
	});
});
