/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { UnicodeEmojiDef } from '@shared/utility/emojilist.js';

export function checkReactionPermissions(
	me: Misskey.entities.MeDetailed,
	note: Misskey.entities.Note,
	emoji: Misskey.entities.EmojiSimple | UnicodeEmojiDef | string,
): boolean {
	// カスタム絵文字の localOnly・isSensitive・ロール制約は文字列/Unicode 絵文字には適用しない。
	if (typeof emoji === 'string') {
		return true;
	}
	if ('char' in emoji) {
		return true;
	}

	const roleIdsThatCanBeUsedThisEmojiAsReaction = emoji.roleIdsThatCanBeUsedThisEmojiAsReaction ?? [];
	return (
		!(emoji.localOnly && note.user.host !== me.host) &&
		!(
			emoji.isSensitive &&
			(note.reactionAcceptance === 'nonSensitiveOnly' ||
				note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote')
		) &&
		(roleIdsThatCanBeUsedThisEmojiAsReaction.length === 0 ||
			me.roles.some((role) => roleIdsThatCanBeUsedThisEmojiAsReaction.includes(role.id)))
	);
}
