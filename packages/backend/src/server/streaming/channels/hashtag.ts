/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import type { Packed } from '@/misc/json-schema.js';
import type { ApiNoteDependencies } from '@/server/rest/note/note.js';
import {
	isNoteMutedOrBlockedForStream,
	isNoteVisibleForMeForStream,
	requiresSigninForStream,
	sendNoteToStream,
} from '../channel.js';
import type { StreamChannelDefinition } from '../channel.js';

const MAX_TAG_GROUPS = 100;
const MAX_TAGS_PER_GROUP = 10;
const MAX_TAG_LENGTH = 128;

export const honoStreamChannelHashtag: StreamChannelDefinition<ApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		const query = params['q'];
		// ログイン不要のチャンネルで、照合は流れる投稿ごとに走る。問い合わせの大きさを制限し、正規化は 1 度だけにする
		// (投稿ごとに全タグを正規化し直すと、1,600 まとまりで 1 投稿 170 µs かかる)。
		if (!Array.isArray(query) || query.length > MAX_TAG_GROUPS) {
			return false;
		}
		if (
			!query.every(
				(x): x is string[] =>
					Array.isArray(x) &&
					x.length >= 1 &&
					x.length <= MAX_TAGS_PER_GROUP &&
					x.every((y) => typeof y === 'string' && y.length <= MAX_TAG_LENGTH),
			)
		) {
			return false;
		}
		const q = query.map((tags) => tags.map((tag) => normalizeForSearch(tag)));

		const handler = async (note: Packed<'Note'>) => {
			const noteTags = new Set(note.tags ? note.tags.map((t: string) => t.toLowerCase()) : []);
			const matched = q.some((tags) => tags.every((tag) => noteTags.has(tag)));
			if (!matched) {
				return;
			}

			if (!isNoteVisibleForMeForStream(ctx, note)) {
				return;
			}
			if (requiresSigninForStream(ctx, note)) {
				return;
			}
			if (isNoteMutedOrBlockedForStream(ctx, note)) {
				return;
			}

			await sendNoteToStream(deps, ctx, note);
		};

		ctx.subscriber.on('notesStream', handler);

		return {
			dispose: () => {
				ctx.subscriber.off('notesStream', handler);
			},
		};
	},
};
