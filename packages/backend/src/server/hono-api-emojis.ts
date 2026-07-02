/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import { fetchEmojiByIdOrFailFromDatabase, fetchEmojiByNameAndHostFromDatabase, listEmojisByIdsFromDatabase, listLocalEmojisFromDatabase, listLocalEmojisOrderedByCategoryAndNameFromDatabase, listLocalEmojisPageFromDatabase, listRemoteEmojisPageFromDatabase, updateEmojiInDatabase, updateEmojisByIdsInDatabase } from '@/core/EmojiStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { HonoApiBroadcastStreamPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiEmojiDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	publishBroadcastStream?: HonoApiBroadcastStreamPublisher;
};

const emojiParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
	},
	required: ['name'],
} as const;

const adminEmojiListParamDef = {
	type: 'object',
	properties: {
		query: { type: 'string', nullable: true, default: null },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

const adminEmojiListRemoteParamDef = {
	type: 'object',
	properties: {
		query: { type: 'string', nullable: true, default: null },
		host: {
			type: 'string',
			nullable: true,
			default: null,
			description: 'Use `null` to represent the local host.',
		},
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

const adminEmojiAliasesBulkParamDef = {
	type: 'object',
	properties: {
		ids: { type: 'array', items: {
			type: 'string', format: 'misskey:id',
		} },
		aliases: { type: 'array', items: {
			type: 'string',
		} },
	},
	required: ['ids', 'aliases'],
} as const;

const adminEmojiSetCategoryBulkParamDef = {
	type: 'object',
	properties: {
		ids: { type: 'array', items: {
			type: 'string', format: 'misskey:id',
		} },
		category: {
			type: 'string',
			nullable: true,
			description: 'Use `null` to reset the category.',
		},
	},
	required: ['ids'],
} as const;

const adminEmojiSetLicenseBulkParamDef = {
	type: 'object',
	properties: {
		ids: { type: 'array', items: {
			type: 'string', format: 'misskey:id',
		} },
		license: {
			type: 'string',
			nullable: true,
			description: 'Use `null` to reset the license.',
		},
	},
	required: ['ids'],
} as const;

type EmojiParams = {
	name: string;
};
type AdminEmojiListParams = SchemaType<typeof adminEmojiListParamDef>;
type AdminEmojiListRemoteParams = SchemaType<typeof adminEmojiListRemoteParamDef>;
type AdminEmojiAliasesBulkParams = SchemaType<typeof adminEmojiAliasesBulkParamDef>;
type AdminEmojiSetCategoryBulkParams = SchemaType<typeof adminEmojiSetCategoryBulkParamDef>;
type AdminEmojiSetLicenseBulkParams = SchemaType<typeof adminEmojiSetLicenseBulkParamDef>;

function packHonoEmojiSimple(emoji: MiEmoji): Packed<'EmojiSimple'> {
	return {
		aliases: emoji.aliases,
		name: emoji.name,
		category: emoji.category,
		url: emoji.publicUrl || emoji.originalUrl,
		localOnly: emoji.localOnly ? true : undefined,
		isSensitive: emoji.isSensitive ? true : undefined,
		roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0 ? emoji.roleIdsThatCanBeUsedThisEmojiAsReaction : undefined,
	};
}

export function packHonoEmojiDetailed(emoji: MiEmoji): Packed<'EmojiDetailed'> {
	return {
		id: emoji.id,
		aliases: emoji.aliases,
		name: emoji.name,
		category: emoji.category,
		host: emoji.host,
		url: emoji.publicUrl || emoji.originalUrl,
		license: emoji.license,
		isSensitive: emoji.isSensitive,
		localOnly: emoji.localOnly,
		roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction,
	};
}

function parseLocalAdminEmojiPagination(
	config: Config,
	params: Pick<AdminEmojiListParams, 'sinceDate' | 'sinceId' | 'untilDate' | 'untilId'>,
): {
	order: 'asc' | 'desc';
	sinceId: string | null;
	untilId: string | null;
} {
	let sinceId: string | null = null;
	let untilId: string | null = null;
	let order: 'asc' | 'desc' = 'desc';

	if (params.sinceId && params.untilId) {
		sinceId = params.sinceId;
		untilId = params.untilId;
	} else if (params.sinceId) {
		sinceId = params.sinceId;
		order = 'asc';
	} else if (params.untilId) {
		untilId = params.untilId;
	} else if (params.sinceDate && params.untilDate) {
		sinceId = genId(config, params.sinceDate);
		untilId = genId(config, params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(config, params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(config, params.untilDate);
	}

	return { order, sinceId, untilId };
}

function parseRemoteAdminEmojiPagination(
	config: Config,
	params: Pick<AdminEmojiListRemoteParams, 'sinceDate' | 'sinceId' | 'untilDate' | 'untilId'>,
): {
	sinceId: string | null;
	untilId: string | null;
} {
	let sinceId: string | null = null;
	let untilId: string | null = null;

	if (params.sinceId && params.untilId) {
		sinceId = params.sinceId;
		untilId = params.untilId;
	} else if (params.sinceId) {
		sinceId = params.sinceId;
	} else if (params.untilId) {
		untilId = params.untilId;
	} else if (params.sinceDate && params.untilDate) {
		sinceId = genId(config, params.sinceDate);
		untilId = genId(config, params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(config, params.sinceDate);
	} else if (params.untilDate) {
		untilId = genId(config, params.untilDate);
	}

	return { sinceId, untilId };
}

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

function noSuchEmojiError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such emoji.',
		code: 'NO_SUCH_EMOJI',
		id: 'e2785b66-dca3-4087-9cac-b93c541cc425',
	});
}

async function refreshHonoApiLocalEmojisCache(deps: HonoApiEmojiDependencies): Promise<void> {
	const emojis = await listLocalEmojisFromDatabase(deps.db);
	await deps.redis.set(
		'singlecache:localEmojis',
		JSON.stringify(emojis),
		'EX',
		60 * 30,
	);
}

async function publishHonoApiEmojiUpdated(
	deps: HonoApiEmojiDependencies,
	ids: MiEmoji['id'][],
): Promise<void> {
	const emojis = await Promise.all(ids.map(id => fetchEmojiByIdOrFailFromDatabase(deps.db, id)));
	if (deps.publishBroadcastStream == null) return;

	deps.publishBroadcastStream('emojiUpdated', {
		emojis: emojis.map(packHonoEmojiDetailed),
	});
}

async function finishHonoApiEmojiBulkUpdate(
	deps: HonoApiEmojiDependencies,
	ids: MiEmoji['id'][],
): Promise<void> {
	await refreshHonoApiLocalEmojisCache(deps);
	await publishHonoApiEmojiUpdated(deps, ids);
}

export async function handleHonoApiEmojis(deps: HonoApiEmojiDependencies): Promise<{
	emojis: Packed<'EmojiSimple'>[];
}> {
	const emojis = await listLocalEmojisOrderedByCategoryAndNameFromDatabase(deps.db);
	return {
		emojis: emojis.map(packHonoEmojiSimple),
	};
}

export async function handleHonoApiEmoji(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>> {
	const params = parseHonoApiParams(emojiParamDef, body) as EmojiParams;
	const emoji = await fetchEmojiByNameAndHostFromDatabase(deps.db, params.name, null);
	if (emoji == null) throw noSuchEmojiError();

	return packHonoEmojiDetailed(emoji);
}

export async function handleHonoApiAdminEmojiList(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>[]> {
	const params = parseHonoApiParams(adminEmojiListParamDef, body) as AdminEmojiListParams;
	const { order, sinceId, untilId } = parseLocalAdminEmojiPagination(deps.config, params);

	let emojis: MiEmoji[];
	if (params.query) {
		emojis = await listLocalEmojisPageFromDatabase(deps.db, { order, sinceId, untilId });
		const queryArray = params.query.match(/\:([a-z0-9_]*)\:/g);

		if (queryArray) {
			emojis = emojis.filter(emoji => queryArray.includes(`:${emoji.name}:`));
		} else {
			emojis = emojis.filter(emoji =>
				emoji.name.includes(params.query!) ||
				emoji.aliases.some(alias => alias.includes(params.query!)) ||
				emoji.category?.includes(params.query!));
		}
		emojis.splice(params.limit + 1);
	} else {
		emojis = await listLocalEmojisPageFromDatabase(deps.db, { order, sinceId, untilId, limit: params.limit });
	}

	return emojis.map(packHonoEmojiDetailed);
}

export async function handleHonoApiAdminEmojiAddAliasesBulk(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiAliasesBulkParamDef, body) as AdminEmojiAliasesBulkParams;
	const emojis = await listEmojisByIdsFromDatabase(deps.db, params.ids);

	for (const emoji of emojis) {
		await updateEmojiInDatabase(deps.db, emoji.id, {
			updatedAt: new Date(),
			aliases: [...new Set(emoji.aliases.concat(params.aliases))],
		});
	}

	await finishHonoApiEmojiBulkUpdate(deps, params.ids);
}

export async function handleHonoApiAdminEmojiSetAliasesBulk(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiAliasesBulkParamDef, body) as AdminEmojiAliasesBulkParams;
	await updateEmojisByIdsInDatabase(deps.db, params.ids, {
		updatedAt: new Date(),
		aliases: params.aliases,
	});

	await finishHonoApiEmojiBulkUpdate(deps, params.ids);
}

export async function handleHonoApiAdminEmojiRemoveAliasesBulk(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiAliasesBulkParamDef, body) as AdminEmojiAliasesBulkParams;
	const emojis = await listEmojisByIdsFromDatabase(deps.db, params.ids);

	for (const emoji of emojis) {
		await updateEmojiInDatabase(deps.db, emoji.id, {
			updatedAt: new Date(),
			aliases: emoji.aliases.filter(alias => !params.aliases.includes(alias)),
		});
	}

	await finishHonoApiEmojiBulkUpdate(deps, params.ids);
}

export async function handleHonoApiAdminEmojiSetCategoryBulk(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiSetCategoryBulkParamDef, body) as AdminEmojiSetCategoryBulkParams;
	await updateEmojisByIdsInDatabase(deps.db, params.ids, {
		updatedAt: new Date(),
		category: params.category ?? null,
	});

	await finishHonoApiEmojiBulkUpdate(deps, params.ids);
}

export async function handleHonoApiAdminEmojiSetLicenseBulk(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiSetLicenseBulkParamDef, body) as AdminEmojiSetLicenseBulkParams;
	await updateEmojisByIdsInDatabase(deps.db, params.ids, {
		updatedAt: new Date(),
		license: params.license ?? null,
	});

	await finishHonoApiEmojiBulkUpdate(deps, params.ids);
}

export async function handleHonoApiAdminEmojiListRemote(
	deps: HonoApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>[]> {
	const params = parseHonoApiParams(adminEmojiListRemoteParamDef, body) as AdminEmojiListRemoteParams;
	const { sinceId, untilId } = parseRemoteAdminEmojiPagination(deps.config, params);
	const emojis = await listRemoteEmojisPageFromDatabase(deps.db, {
		host: params.host == null ? null : toPuny(params.host),
		query: params.query,
		sinceId,
		untilId,
		limit: params.limit,
	});

	return emojis.map(packHonoEmojiDetailed);
}
