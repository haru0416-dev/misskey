/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { fetchEmojiByNameAndHostFromDatabase, listLocalEmojisOrderedByCategoryAndNameFromDatabase, listLocalEmojisPageFromDatabase, listRemoteEmojisPageFromDatabase } from '@/core/EmojiStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiEmoji } from '@/models/Emoji.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiEmojiDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
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

type EmojiParams = {
	name: string;
};
type AdminEmojiListParams = SchemaType<typeof adminEmojiListParamDef>;
type AdminEmojiListRemoteParams = SchemaType<typeof adminEmojiListRemoteParamDef>;

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
