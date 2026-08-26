/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import type { MiMeta } from '@/models/Meta.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { translateTextForHonoApi } from '@/server/rest/note.js';

type SendArgs = Parameters<HttpRequestService['send']>;

function meta(overrides: Partial<MiMeta>): MiMeta {
	return {
		translatorProvider: 'deepl',
		deeplAuthKey: null,
		deeplIsPro: false,
		libreTranslateApiUrl: null,
		libreTranslateApiKey: null,
		...overrides,
	} as MiMeta;
}

describe('translateTextForHonoApi', () => {
	test('uses DeepL by default and validates its response', async () => {
		const send = vi.fn(
			async (_url: SendArgs[0], _args?: SendArgs[1]) =>
				new Response(
					JSON.stringify({
						translations: [{ detected_source_language: 'JA', text: 'Hello' }],
					}),
				),
		);

		await expect(
			translateTextForHonoApi(
				{
					meta: meta({ deeplAuthKey: 'secret' }),
					httpRequestService: { send },
				},
				'こんにちは',
				'en',
			),
		).resolves.toEqual({ sourceLang: 'JA', text: 'Hello' });
		expect(send).toHaveBeenCalledWith(
			'https://api-free.deepl.com/v2/translate',
			expect.objectContaining({
				method: 'POST',
				body: 'text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF&target_lang=en',
			}),
		);
	});

	test('uses a self-hosted LibreTranslate endpoint without requiring an API key', async () => {
		const send = vi.fn(
			async (_url: SendArgs[0], _args?: SendArgs[1]) =>
				new Response(
					JSON.stringify({
						detectedLanguage: { confidence: 100, language: 'ja' },
						translatedText: 'Hello',
					}),
				),
		);

		await expect(
			translateTextForHonoApi(
				{
					meta: meta({ translatorProvider: 'libreTranslate', libreTranslateApiUrl: 'http://localhost:5000/base/' }),
					httpRequestService: { send },
				},
				'こんにちは',
				'EN',
			),
		).resolves.toEqual({ sourceLang: 'ja', text: 'Hello' });

		const [url, init] = send.mock.calls[0]!;
		expect(url).toBe('http://localhost:5000/base/translate');
		expect(JSON.parse(init!.body as string)).toEqual({
			q: 'こんにちは',
			source: 'auto',
			target: 'en',
			format: 'text',
		});
	});

	test('includes the optional LibreTranslate API key', async () => {
		const send = vi.fn(
			async (_url: SendArgs[0], _args?: SendArgs[1]) => new Response(JSON.stringify({ translatedText: 'Hello' })),
		);
		await translateTextForHonoApi(
			{
				meta: meta({
					translatorProvider: 'libreTranslate',
					libreTranslateApiUrl: 'https://translate.example',
					libreTranslateApiKey: 'secret',
				}),
				httpRequestService: { send },
			},
			'こんにちは',
			'en',
		);

		const body = JSON.parse(send.mock.calls[0]![1]!.body as string);
		expect(body.api_key).toBe('secret');
	});
});
