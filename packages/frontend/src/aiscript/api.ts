/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { errors, utils, values } from '@syuilo/aiscript';
import type { Interpreter, Parser } from '@syuilo/aiscript';
import * as Misskey from 'misskey-js';
import { url, lang } from '@shared/utility/config.js';
import { assertStringAndIsIn } from './common.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';
import { customEmojis } from '@/features/custom-emojis/custom-emojis.js';

const DIALOG_TYPES = ['error', 'info', 'success', 'warning', 'waiting', 'question'] as const;

// Mk:dialog と Mk:confirm の引数。どれも省略または null を許す。
function parseDialogArgs(
	_title: values.Value | undefined,
	_text: values.Value | undefined,
	_type: values.Value | undefined,
	defaultType: (typeof DIALOG_TYPES)[number],
) {
	let title: string | undefined = undefined;
	let text: string | undefined = undefined;
	let type: (typeof DIALOG_TYPES)[number] = defaultType;

	if (_title != null) {
		if (utils.isString(_title)) {
			title = _title.value;
		} else {
			utils.assertNull(_title);
		}
	}

	if (_text != null) {
		if (utils.isString(_text)) {
			text = _text.value;
		} else {
			utils.assertNull(_text);
		}
	}

	if (_type != null) {
		if (utils.isString(_type)) {
			assertStringAndIsIn(_type, DIALOG_TYPES);
			type = _type.value;
		} else {
			utils.assertNull(_type);
		}
	}

	return { type, title, text };
}

export function aiScriptReadline(q: string): Promise<string> {
	return new Promise((ok) => {
		os.inputText({
			title: q,
		}).then(({ result: a }) => {
			ok(a ?? '');
		});
	});
}

/**
 * Interpreter の `err` に渡す。渡さないと、UI のボタンやタイマーから後で呼ばれた関数のエラーが
 * 未処理の rejection になり、画面に何も出ない。
 */
export function alertAiScriptError(err: { toString(): string }): void {
	os.alert({
		type: 'error',
		title: 'AiScript Error',
		text: err.toString(),
	});
}

/**
 * 構文エラーでは実行せず、ダイアログで知らせる。Interpreter には `err: alertAiScriptError` を渡しておくこと。
 * 実行時のエラーはそちらで通知されるので、ここで捕まえるのは AiScript 内部のエラーだけになる。
 */
export async function execAiScriptWithAlert(interpreter: Interpreter, parser: Parser, script: string): Promise<void> {
	let ast;
	try {
		ast = parser.parse(script);
	} catch (err) {
		os.alert({
			type: 'error',
			title: 'Syntax Error',
			text: String(err),
		});
		return;
	}
	try {
		await interpreter.exec(ast);
	} catch (err) {
		os.alert({
			type: 'error',
			title: 'Internal Error',
			text: err instanceof Error ? err.message : String(err),
		});
	}
}

export function createAiScriptEnv(opts: { storageKey: string; token?: string }) {
	return {
		USER_ID: $i ? values.STR($i.id) : values.NULL,
		USER_NAME: $i?.name ? values.STR($i.name) : values.NULL,
		USER_USERNAME: $i ? values.STR($i.username) : values.NULL,
		CUSTOM_EMOJIS: utils.jsToVal(customEmojis.value),
		LOCALE: values.STR(lang),
		SERVER_URL: values.STR(url),
		'Mk:dialog': values.FN_NATIVE(async ([_title, _text, _type]) => {
			const { type, title, text } = parseDialogArgs(_title, _text, _type, 'info');

			await os.alert({
				type,
				...(title === undefined ? {} : { title }),
				...(text === undefined ? {} : { text }),
			});
			return values.NULL;
		}),
		'Mk:confirm': values.FN_NATIVE(async ([_title, _text, _type]) => {
			const { type, title, text } = parseDialogArgs(_title, _text, _type, 'question');

			const confirm = await os.confirm({
				type,
				...(title === undefined ? {} : { title }),
				...(text === undefined ? {} : { text }),
			});
			return confirm.canceled ? values.FALSE : values.TRUE;
		}),
		'Mk:toast': values.FN_NATIVE(([text]) => {
			utils.assertString(text);
			os.toast(text.value);
			return values.NULL;
		}),
		'Mk:api': values.FN_NATIVE(async ([ep, param, token]) => {
			utils.assertString(ep);
			if (ep.value.includes('://') || ep.value.includes('..')) {
				throw new errors.AiScriptRuntimeError('invalid endpoint');
			}

			let actualToken: string | null = null;
			if (token != null && !utils.isNull(token)) {
				utils.assertString(token);
				// バグがあればundefinedもあり得るため念のため
				if (typeof token.value !== 'string') {
					throw new errors.AiScriptRuntimeError('invalid token');
				}
				actualToken = token.value;
			}

			if (actualToken == null) {
				actualToken = opts.token ?? null;
			}

			if (param == null) {
				throw new errors.AiScriptRuntimeError('expected param');
			}

			utils.assertObject(param);
			return misskeyApi(ep.value as keyof Misskey.Endpoints, utils.valToJs(param) as object, actualToken).then(
				(res) => {
					return utils.jsToVal(res);
				},
				(err) => {
					return values.ERROR('request_failed', utils.jsToVal(err));
				},
			);
		}),
		'Mk:save': values.FN_NATIVE(([key, value]) => {
			utils.assertString(key);
			utils.expectAny(value);
			miLocalStorage.setItem(`aiscript:${opts.storageKey}:${key.value}`, JSON.stringify(utils.valToJs(value)));
			return values.NULL;
		}),
		'Mk:load': values.FN_NATIVE(([key]) => {
			utils.assertString(key);
			return utils.jsToVal(miLocalStorage.getItemAsJson(`aiscript:${opts.storageKey}:${key.value}`) ?? null);
		}),
		'Mk:remove': values.FN_NATIVE(([key]) => {
			utils.assertString(key);
			miLocalStorage.removeItem(`aiscript:${opts.storageKey}:${key.value}`);
			return values.NULL;
		}),
		'Mk:url': values.FN_NATIVE(() => {
			return values.STR(window.location.href);
		}),
		'Mk:nyaize': values.FN_NATIVE(([text]) => {
			utils.assertString(text);
			return values.STR(Misskey.nyaize(text.value));
		}),
	};
}
