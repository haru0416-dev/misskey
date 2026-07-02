/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	fetchHashtagByNameFromDatabase,
	listHashtagsFromDatabase,
	searchHashtagNamesFromDatabase,
	type HashtagSort,
} from '@/core/HashtagStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiHashtag } from '@/models/Hashtag.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiHashtagDependencies = {
	db: MiDrizzleDatabase;
};

const hashtagsListParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		attachedToUserOnly: { type: 'boolean', default: false },
		attachedToLocalUserOnly: { type: 'boolean', default: false },
		attachedToRemoteUserOnly: { type: 'boolean', default: false },
		sort: { type: 'string', enum: ['+mentionedUsers', '-mentionedUsers', '+mentionedLocalUsers', '-mentionedLocalUsers', '+mentionedRemoteUsers', '-mentionedRemoteUsers', '+attachedUsers', '-attachedUsers', '+attachedLocalUsers', '-attachedLocalUsers', '+attachedRemoteUsers', '-attachedRemoteUsers'] },
	},
	required: ['sort'],
} as const;

const hashtagsSearchParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		query: { type: 'string' },
		offset: { type: 'integer', default: 0 },
	},
	required: ['query'],
} as const;

const hashtagsShowParamDef = {
	type: 'object',
	properties: {
		tag: { type: 'string' },
	},
	required: ['tag'],
} as const;

type HashtagsListParams = SchemaType<typeof hashtagsListParamDef>;
type HashtagsSearchParams = SchemaType<typeof hashtagsSearchParamDef>;
type HashtagsShowParams = SchemaType<typeof hashtagsShowParamDef>;

function noSuchHashtagError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such hashtag.',
		code: 'NO_SUCH_HASHTAG',
		id: '110ee688-193e-4a3a-9ecf-c167b2e6981e',
	});
}

function packHonoApiHashtag(src: MiHashtag): Packed<'Hashtag'> {
	return {
		tag: src.name,
		mentionedUsersCount: src.mentionedUsersCount,
		mentionedLocalUsersCount: src.mentionedLocalUsersCount,
		mentionedRemoteUsersCount: src.mentionedRemoteUsersCount,
		attachedUsersCount: src.attachedUsersCount,
		attachedLocalUsersCount: src.attachedLocalUsersCount,
		attachedRemoteUsersCount: src.attachedRemoteUsersCount,
	};
}

export async function handleHonoApiHashtagsList(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Hashtag'>[]> {
	const params = parseHonoApiParams(hashtagsListParamDef, body) as HashtagsListParams;
	const tags = await listHashtagsFromDatabase(deps.db, {
		limit: params.limit,
		attachedToUserOnly: params.attachedToUserOnly,
		attachedToLocalUserOnly: params.attachedToLocalUserOnly,
		attachedToRemoteUserOnly: params.attachedToRemoteUserOnly,
		sort: params.sort as HashtagSort,
	});

	return tags.map(packHonoApiHashtag);
}

export async function handleHonoApiHashtagsSearch(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<string[]> {
	const params = parseHonoApiParams(hashtagsSearchParamDef, body) as HashtagsSearchParams;
	return await searchHashtagNamesFromDatabase(deps.db, {
		query: params.query,
		limit: params.limit,
		offset: params.offset,
	});
}

export async function handleHonoApiHashtagsShow(
	deps: HonoApiHashtagDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Hashtag'>> {
	const params = parseHonoApiParams(hashtagsShowParamDef, body) as HashtagsShowParams;
	const hashtag = await fetchHashtagByNameFromDatabase(deps.db, normalizeForSearch(params.tag));
	if (hashtag == null) throw noSuchHashtagError();

	return packHonoApiHashtag(hashtag);
}
