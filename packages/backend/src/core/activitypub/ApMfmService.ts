/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { MfmService } from '@/core/mfm/MfmService.js';
import type { MiNote } from '@/models/Note.js';
import { extractApHashtagObjects } from './models/tag.js';
import type { IObject } from './type.js';

export function createApMfmService(mfmService: MfmService) {
	function htmlToMfm(html: string, tag?: IObject | IObject[]): string {
		const hashtagNames = extractApHashtagObjects(tag).map((x) => x.name);
		return mfmService.fromHtml(html, hashtagNames);
	}

	function getNoteHtml(note: Pick<MiNote, 'text' | 'mentionedRemoteUsers'>, extraHtml: string | null = null) {
		let noMisskeyContent = false;
		const srcMfm = note.text ?? '';

		const parsed = mfm.parse(srcMfm);

		if (
			extraHtml == null &&
			parsed.every((n) => ['text', 'unicodeEmoji', 'emojiCode', 'mention', 'hashtag', 'url'].includes(n.type))
		) {
			noMisskeyContent = true;
		}

		const content = mfmService.toHtml(parsed, JSON.parse(note.mentionedRemoteUsers), extraHtml);

		return {
			content,
			noMisskeyContent,
		};
	}

	return { htmlToMfm, getNoteHtml };
}

export type ApMfmService = ReturnType<typeof createApMfmService>;
