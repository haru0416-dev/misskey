/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { describe, test, beforeAll } from 'vitest';

import { loadConfig } from '@/config.js';
import { createApMfmService, type ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { createMfmService } from '@/core/MfmService.js';

describe('ApMfmService', () => {
	let apMfmService: ApMfmService;

	beforeAll(() => {
		apMfmService = createApMfmService(createMfmService(loadConfig()));
	});

	describe('getNoteHtml', () => {
		test('Do not provide _misskey_content for simple text', () => {
			const note = {
				text: 'テキスト #タグ @mention 🍊 :emoji: https://example.com',
				mentionedRemoteUsers: '[]',
			};

			const { content, noMisskeyContent } = apMfmService.getNoteHtml(note);

			assert.equal(noMisskeyContent, true, 'noMisskeyContent');
			assert.equal(content, 'テキスト <a href="http://misskey.local/tags/%E3%82%BF%E3%82%B0" rel="tag">#タグ</a> <a href="http://misskey.local/@mention" class="u-url mention">@mention</a> 🍊 ​:emoji:​ <a href="https://example.com/">https://example.com</a>', 'content');
		});

		test('Provide _misskey_content for MFM', () => {
			const note = {
				text: '$[tada foo]',
				mentionedRemoteUsers: '[]',
			};

			const { content, noMisskeyContent } = apMfmService.getNoteHtml(note);

			assert.equal(noMisskeyContent, false, 'noMisskeyContent');
			assert.equal(content, '<i>foo</i>', 'content');
		});
	});
});
