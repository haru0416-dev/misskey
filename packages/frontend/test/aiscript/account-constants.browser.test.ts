/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Interpreter, Parser, values } from '@syuilo/aiscript';
import { describe, expect, test, vi } from 'vitest';
import { aiScriptReadline, createAiScriptEnv } from '@/aiscript/api.js';

// アカウントは本体の読み込み時に確定するため、匿名の API suite とは別のブラウザーで検証する。
vi.mock('@/i.js', () => ({
	$i: { id: 'xxxxxxxx', name: '藍', username: 'ai' },
}));
vi.mock('@/os.js', () => ({
	inputText: vi.fn(() => {
		throw new Error('Unexpected input dialog');
	}),
	alert: vi.fn(() => {
		throw new Error('Unexpected alert dialog');
	}),
	confirm: vi.fn(() => {
		throw new Error('Unexpected confirmation dialog');
	}),
	toast: vi.fn(() => {
		throw new Error('Unexpected toast');
	}),
}));
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(() => {
		throw new Error('Unexpected API request');
	}),
}));
vi.mock('@/features/custom-emoji/custom-emojis.js', () => ({
	customEmojis: { value: [] },
}));

describe('AiScript common API', () => {
	describe('user constants', () => {
		describe('logged in', () => {
			test('exposes account constants', async () => {
				const res: values.Value[] = [];
				const interpreter = new Interpreter(createAiScriptEnv({ storageKey: 'widget' }), {
					in: aiScriptReadline,
					out: (value) => {
						res.push(value);
					},
				});
				await interpreter.exec(
					Parser.parse(`
					<: USER_ID
					<: USER_NAME
					<: USER_USERNAME
				`),
				);
				expect(res).toStrictEqual([values.STR('xxxxxxxx'), values.STR('藍'), values.STR('ai')]);
			});
		});
	});
});
