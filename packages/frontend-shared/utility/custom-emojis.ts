/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function isEmojiSimple(value: unknown): value is Misskey.entities.EmojiSimple {
	if (typeof value !== 'object' || value === null) return false;

	const emoji = value as Record<string, unknown>;
	return typeof emoji.name === 'string'
		&& typeof emoji.url === 'string'
		&& (typeof emoji.category === 'string' || emoji.category === null)
		&& isStringArray(emoji.aliases)
		&& (emoji.localOnly === undefined || typeof emoji.localOnly === 'boolean')
		&& (emoji.isSensitive === undefined || typeof emoji.isSensitive === 'boolean')
		&& (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction === undefined || isStringArray(emoji.roleIdsThatCanBeUsedThisEmojiAsReaction));
}

export function isEmojiSimpleArray(value: unknown): value is Misskey.entities.EmojiSimple[] {
	return Array.isArray(value) && value.every(isEmojiSimple);
}
