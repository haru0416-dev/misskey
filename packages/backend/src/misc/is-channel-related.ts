/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiNote } from '@/models/Note.js';
import type { Packed } from '@/misc/json-schema.js';

/**
 * note が channelIds のチャンネルへの投稿か、それらのチャンネルの投稿をリノート・引用した投稿かを判定する。
 *
 * @param ignoreAuthor true なら note 自身の所属チャンネルが channelIds に含まれていても無視する
 */
export function isChannelRelated(
	note: MiNote | Packed<'Note'>,
	channelIds: Set<string>,
	ignoreAuthor = false,
): boolean {
	if (!ignoreAuthor && note.channelId && channelIds.has(note.channelId)) {
		return true;
	}

	const renoteChannelId = note.renote?.channelId;
	if (renoteChannelId != null && renoteChannelId !== note.channelId && channelIds.has(renoteChannelId)) {
		return true;
	}

	// note作成時にreply先のchannelへ正規化されるため、replyを別途辿らなくてもnote.channelIdで判定できる。

	return false;
}
