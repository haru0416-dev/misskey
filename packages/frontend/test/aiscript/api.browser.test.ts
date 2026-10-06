/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';
import { aiScriptReadline, createAiScriptEnv } from '@/aiscript/api.js';
import { errors, Interpreter, Parser, values } from '@syuilo/aiscript';
import { beforeEach, describe, expect, test, vi } from 'vitest';

async function exe(script: string): Promise<values.Value[]> {
	const outputs: values.Value[] = [];
	const interpreter = new Interpreter(createAiScriptEnv({ storageKey: 'widget' }), {
		in: aiScriptReadline,
		out: (value) => {
			outputs.push(value);
		},
	});
	const ast = Parser.parse(script);
	await interpreter.exec(ast);
	return outputs;
}

function errorWithPos<T extends errors.AiScriptError>(error: T, line: number, column: number): T {
	const pos = { line, column };
	error.pos = pos;
	error.message = error.message + `\n  at <root> (Line ${pos.line}, Column ${pos.column})`;
	return error;
}

vi.mock('@/i.js', () => ({ $i: null }));

const osMock = vi.hoisted(() => {
	return {
		inputText: vi.fn(),
		alert: vi.fn(),
		confirm: vi.fn(),
		toast: vi.fn(() => {
			throw new Error('Unexpected toast');
		}),
	};
});

vi.mock('@/os.js', () => {
	return osMock;
});

const misskeyApiMock = vi.hoisted(() => vi.fn());

vi.mock('@/utility/misskey-api.js', () => {
	return { misskeyApi: misskeyApiMock };
});
// AiScript の API 契約に、絵文字一覧の永続 cache や取得処理を含めない。
vi.mock('@/features/custom-emoji/custom-emojis.js', () => ({
	customEmojis: { value: [] },
}));

describe('AiScript common API', () => {
	describe('readline', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
			vi.clearAllMocks();
		});

		test('ok', { concurrent: false }, async () => {
			osMock.inputText.mockImplementationOnce(async ({ title }) => {
				expect(title).toBe('question');
				return {
					canceled: false,
					result: 'Hello',
				};
			});
			const [res] = await exe(`
				<: readline('question')
			`);
			expect(res).toStrictEqual(values.STR('Hello'));
			expect(osMock.inputText).toHaveBeenCalledOnce();
		});

		test('cancelled', { concurrent: false }, async () => {
			osMock.inputText.mockImplementationOnce(async ({ title }) => {
				expect(title).toBe('question');
				return {
					canceled: true,
					result: undefined,
				};
			});
			const [res] = await exe(`
				<: readline('question')
			`);
			expect(res).toStrictEqual(values.STR(''));
			expect(osMock.inputText).toHaveBeenCalledOnce();
		});
	});

	describe('user constants', () => {
		describe('not logged in', { concurrent: false }, () => {
			test.concurrent('exposes null account constants', async () => {
				const res = await exe(`
					<: USER_ID
					<: USER_NAME
					<: USER_USERNAME
				`);
				expect(res).toStrictEqual([values.NULL, values.NULL, values.NULL]);
			});
		});
	});

	describe('dialog', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
			vi.clearAllMocks();
		});

		test('ok', { concurrent: false }, async () => {
			osMock.alert.mockImplementationOnce(async ({ type, title, text }) => {
				expect(type).toBe('success');
				expect(title).toBe('Hello');
				expect(text).toBe('world');
			});
			const [res] = await exe(`
				<: Mk:dialog('Hello', 'world', 'success')
			`);
			expect(res).toStrictEqual(values.NULL);
			expect(osMock.alert).toHaveBeenCalledOnce();
		});

		test('omit type', { concurrent: false }, async () => {
			osMock.alert.mockImplementationOnce(async ({ type, title, text }) => {
				expect(type).toBe('info');
				expect(title).toBe('Hello');
				expect(text).toBe('world');
			});
			const [res] = await exe(`
				<: Mk:dialog('Hello', 'world')
			`);
			expect(res).toStrictEqual(values.NULL);
			expect(osMock.alert).toHaveBeenCalledOnce();
		});

		test('invalid type', { concurrent: false }, async () => {
			await expect(() =>
				exe(`
				<: Mk:dialog('Hello', 'world', 'invalid')
			`),
			).rejects.toBeInstanceOf(errors.AiScriptRuntimeError);
			expect(osMock.alert).not.toHaveBeenCalled();
		});
	});

	describe('confirm', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
			vi.clearAllMocks();
		});

		test('ok', { concurrent: false }, async () => {
			osMock.confirm.mockImplementationOnce(async ({ type, title, text }) => {
				expect(type).toBe('success');
				expect(title).toBe('Hello');
				expect(text).toBe('world');
				return { canceled: false };
			});
			const [res] = await exe(`
				<: Mk:confirm('Hello', 'world', 'success')
			`);
			expect(res).toStrictEqual(values.TRUE);
			expect(osMock.confirm).toHaveBeenCalledOnce();
		});

		test('omit type', { concurrent: false }, async () => {
			osMock.confirm.mockImplementationOnce(async ({ type, title, text }) => {
				expect(type).toBe('question');
				expect(title).toBe('Hello');
				expect(text).toBe('world');
				return { canceled: false };
			});
			const [res] = await exe(`
				<: Mk:confirm('Hello', 'world')
			`);
			expect(res).toStrictEqual(values.TRUE);
			expect(osMock.confirm).toHaveBeenCalledOnce();
		});

		test('canceled', { concurrent: false }, async () => {
			osMock.confirm.mockImplementationOnce(async ({ type, title, text }) => {
				expect(type).toBe('question');
				expect(title).toBe('Hello');
				expect(text).toBe('world');
				return { canceled: true };
			});
			const [res] = await exe(`
				<: Mk:confirm('Hello', 'world')
			`);
			expect(res).toStrictEqual(values.FALSE);
			expect(osMock.confirm).toHaveBeenCalledOnce();
		});

		test('invalid type', { concurrent: false }, async () => {
			const confirm = osMock.confirm;
			await expect(() =>
				exe(`
				<: Mk:confirm('Hello', 'world', 'invalid')
			`),
			).rejects.toBeInstanceOf(errors.AiScriptRuntimeError);
			expect(confirm).not.toHaveBeenCalled();
		});
	});

	describe('api', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
			vi.clearAllMocks();
		});

		test('successful', { concurrent: false }, async () => {
			misskeyApiMock.mockImplementationOnce(async (endpoint, data, token) => {
				expect(endpoint).toBe('ping');
				expect(data).toStrictEqual({});
				expect(token).toBeNull();
				return { pong: 1_735_657_200_000 };
			});
			const [res] = await exe(`
				<: Mk:api('ping', {})
			`);
			expect(res).toStrictEqual(values.OBJ(new Map([['pong', values.NUM(1_735_657_200_000)]])));
			expect(misskeyApiMock).toHaveBeenCalledOnce();
		});

		test('with token', { concurrent: false }, async () => {
			misskeyApiMock.mockImplementationOnce(async (endpoint, data, token) => {
				expect(endpoint).toBe('ping');
				expect(data).toStrictEqual({});
				expect(token).toBe('xxxxxxxx');
				return { pong: 1_735_657_200_000 };
			});
			const [res] = await exe(`
				<: Mk:api('ping', {}, 'xxxxxxxx')
			`);
			expect(res).toStrictEqual(values.OBJ(new Map([['pong', values.NUM(1_735_657_200_000)]])));
			expect(misskeyApiMock).toHaveBeenCalledOnce();
		});

		test('request failed', { concurrent: false }, async () => {
			misskeyApiMock.mockRejectedValueOnce('Not Found');
			const [res] = await exe(`
				<: Mk:api('this/endpoint/should/not/be/found', {})
			`);
			expect(res).toStrictEqual(values.ERROR('request_failed', values.STR('Not Found')));
			expect(misskeyApiMock).toHaveBeenCalledOnce();
		});

		test('invalid endpoint', { concurrent: false }, async () => {
			await expect(() =>
				exe(`
				Mk:api('https://example.com/api/ping', {})
			`),
			).rejects.toStrictEqual(errorWithPos(new errors.AiScriptRuntimeError('invalid endpoint'), 2, 11));
			expect(misskeyApiMock).not.toHaveBeenCalled();
		});

		test('missing param', { concurrent: false }, async () => {
			await expect(() =>
				exe(`
				Mk:api('ping')
			`),
			).rejects.toStrictEqual(errorWithPos(new errors.AiScriptRuntimeError('expected param'), 2, 11));
			expect(misskeyApiMock).not.toHaveBeenCalled();
		});
	});

	describe('save and load', () => {
		beforeEach(() => {
			miLocalStorage.removeItem('aiscript:widget:key');
		});

		test('successful', { concurrent: false }, async () => {
			const [res] = await exe(`
				Mk:save('key', 'value')
				<: Mk:load('key')
			`);
			expect(miLocalStorage.getItem('aiscript:widget:key')).toBe('"value"');
			expect(res).toStrictEqual(values.STR('value'));
		});

		test('missing value to save', { concurrent: false }, async () => {
			await expect(() =>
				exe(`
				Mk:save('key')
			`),
			).rejects.toStrictEqual(
				errorWithPos(new errors.AiScriptRuntimeError('Expect anything, but got nothing.'), 2, 12),
			);
		});

		test('remove existing and missing', { concurrent: false }, async () => {
			const res = await exe(`
				Mk:save('key', 'value')
				<: Mk:load('key')
				<: Mk:remove('key')
				<: Mk:load('key')
				<: Mk:remove('key')
				<: Mk:load('key')
			`);
			expect(res).toStrictEqual([values.STR('value'), values.NULL, values.NULL, values.NULL, values.NULL]);
		});
	});

	test('url', async () => {
		const originalUrl = window.location.href;
		const requestedUrl = new URL('/aiscript-url-fixture?query=value#section', window.location.origin).href;
		try {
			window.history.replaceState(null, '', requestedUrl);
			const [res] = await exe(`
				<: Mk:url()
			`);
			expect(res).toStrictEqual(values.STR(requestedUrl));
		} finally {
			window.history.replaceState(null, '', originalUrl);
		}
	});

	test.concurrent('nyaize', async () => {
		const [res] = await exe(`
			<: Mk:nyaize('な')
		`);
		expect(res).toStrictEqual(values.STR('にゃ'));
	});
});
