/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import type { QueryAccountId } from '@/query/keys.js';
import { queryClient } from '@/query/client.js';
import { isEndpointQuery, queryKeys } from '@/query/keys.js';

type UserUpdate = Partial<Misskey.entities.UserDetailed> & Pick<Misskey.entities.User, 'id'>;

function updateUserValue<T>(value: T, user: UserUpdate): T {
	if (Array.isArray(value)) {
		return value.map((item) => updateUserValue(item, user)) as T;
	}
	if (typeof value !== 'object' || value == null || !('id' in value) || value.id !== user.id) return value;
	return { ...value, ...user };
}

export function updateUserQueries(accountId: QueryAccountId, user: UserUpdate): void {
	queryClient.setQueriesData({ queryKey: queryKeys.endpointRoot(accountId, 'users/show') }, (value) =>
		updateUserValue(value, user),
	);
}

export function updateEmojiQueries(
	change:
		| { type: 'add'; emoji: Misskey.entities.EmojiSimple }
		| { type: 'update'; emojis: Misskey.entities.EmojiSimple[] }
		| { type: 'delete'; emojis: Misskey.entities.EmojiSimple[] },
): void {
	const changedByName = change.type === 'update'
		? new Map(change.emojis.map((emoji) => [emoji.name, emoji]))
		: null;
	const deletedNames = change.type === 'delete'
		? new Set(change.emojis.map((emoji) => emoji.name))
		: null;

	queryClient.setQueriesData<{ emojis: Misskey.entities.EmojiSimple[] }>(
		{ predicate: (query) => isEndpointQuery(query.queryKey, 'emojis') },
		(current) => {
			if (current == null) return current;
			if (change.type === 'add') return { ...current, emojis: [change.emoji, ...current.emojis] };
			if (change.type === 'update') {
				return {
					...current,
					emojis: current.emojis.map((item) => changedByName?.get(item.name) ?? item),
				};
			}
			return {
				...current,
				emojis: current.emojis.filter((item) => !deletedNames?.has(item.name)),
			};
		},
	);

	void queryClient.invalidateQueries({ predicate: (query) => isEndpointQuery(query.queryKey, 'emoji') });
}
