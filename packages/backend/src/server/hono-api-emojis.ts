/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import { FILE_TYPE_IMAGE } from '@/const.js';
import { fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { uploadSystemDriveFileFromUrl, type DriveFileUploadDependencies } from '@/core/DriveFileUploadLogic.js';
import { deleteEmojiByIdFromDatabase, emojiExistsWithLocalNameInDatabase, fetchEmojiByIdFromDatabase, fetchEmojiByIdOrFailFromDatabase, fetchEmojiByNameAndHostFromDatabase, insertEmojiInDatabase, listEmojisByIdsFromDatabase, listLocalEmojisFromDatabase, listLocalEmojisOrderedByCategoryAndNameFromDatabase, listLocalEmojisPageFromDatabase, listRemoteEmojisPageFromDatabase, updateEmojiInDatabase, updateEmojisByIdsInDatabase } from '@/core/EmojiStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { DbQueue } from '@/core/QueueModule.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiBroadcastStreamPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiEmojiDependencies = DriveFileUploadDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	dbQueue: DbQueue;
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

const adminEmojiAddParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string', pattern: '^[a-zA-Z0-9_]+$' },
		fileId: { type: 'string', format: 'misskey:id' },
		category: {
			type: 'string',
			nullable: true,
			description: 'Use `null` to reset the category.',
		},
		aliases: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		license: { type: 'string', nullable: true },
		isSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		roleIdsThatCanBeUsedThisEmojiAsReaction: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
	},
	required: ['name', 'fileId'],
} as const;

const adminEmojiUpdateParamDef = {
	allOf: [
		{
			anyOf: [
				{
					type: 'object',
					properties: {
						id: { type: 'string', format: 'misskey:id' },
					},
					required: ['id'],
				},
				{
					type: 'object',
					properties: {
						name: { type: 'string', pattern: '^[a-zA-Z0-9_]+$' },
					},
					required: ['name'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				fileId: { type: 'string', format: 'misskey:id' },
				category: {
					type: 'string',
					nullable: true,
					description: 'Use `null` to reset the category.',
				},
				aliases: { type: 'array', items: {
					type: 'string',
				} },
				license: { type: 'string', nullable: true },
				isSensitive: { type: 'boolean' },
				localOnly: { type: 'boolean' },
				roleIdsThatCanBeUsedThisEmojiAsReaction: { type: 'array', items: {
					type: 'string',
				} },
			},
		},
	],
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

const adminEmojiDeleteParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

const adminEmojiDeleteBulkParamDef = {
	type: 'object',
	properties: {
		ids: { type: 'array', items: {
			type: 'string', format: 'misskey:id',
		} },
	},
	required: ['ids'],
} as const;

const adminEmojiCopyParamDef = {
	type: 'object',
	properties: {
		emojiId: { type: 'string', format: 'misskey:id' },
	},
	required: ['emojiId'],
} as const;

const adminEmojiImportZipParamDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['fileId'],
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
type AdminEmojiAddParams = SchemaType<typeof adminEmojiAddParamDef>;
type AdminEmojiUpdateParams = {
	id?: string;
	name?: string;
	fileId?: string;
	category?: string | null;
	aliases?: string[];
	license?: string | null;
	isSensitive?: boolean;
	localOnly?: boolean;
	roleIdsThatCanBeUsedThisEmojiAsReaction?: string[];
};
type AdminEmojiAliasesBulkParams = SchemaType<typeof adminEmojiAliasesBulkParamDef>;
type AdminEmojiDeleteParams = SchemaType<typeof adminEmojiDeleteParamDef>;
type AdminEmojiDeleteBulkParams = SchemaType<typeof adminEmojiDeleteBulkParamDef>;
type AdminEmojiCopyParams = SchemaType<typeof adminEmojiCopyParamDef>;
type AdminEmojiImportZipParams = SchemaType<typeof adminEmojiImportZipParamDef>;
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

function adminEmojiClientError(message: string, code: string, id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message,
		code,
		id,
	});
}

function adminNoSuchEmojiError(): HonoApiError {
	return adminEmojiClientError('No such emoji.', 'NO_SUCH_EMOJI', '684dec9d-a8c2-4364-9aa8-456c49cb1dc8');
}

function adminAddNoSuchFileError(): HonoApiError {
	return adminEmojiClientError('No such file.', 'NO_SUCH_FILE', 'fc46b5a4-6b92-4c33-ac66-b806659bb5cf');
}

function adminUpdateNoSuchFileError(): HonoApiError {
	return adminEmojiClientError('No such file.', 'NO_SUCH_FILE', '14fb9fd9-0731-4e2f-aeb9-f09e4740333d');
}

function adminUnsupportedFileTypeError(): HonoApiError {
	return adminEmojiClientError('Unsupported file type.', 'UNSUPPORTED_FILE_TYPE', 'f7599d96-8750-af68-1633-9575d625c1a7');
}

function adminDuplicateEmojiNameError(): HonoApiError {
	return adminEmojiClientError('Duplicate name.', 'DUPLICATE_NAME', 'f7a3462c-4e6e-4069-8421-b9bd4f4c3975');
}

function adminCopyNoSuchEmojiError(): HonoApiError {
	return adminEmojiClientError('No such emoji.', 'NO_SUCH_EMOJI', 'e2785b66-dca3-4087-9cac-b93c541cc425');
}

function adminCopyInternalError(): HonoApiError {
	return new HonoApiError({
		status: 500,
		message: 'Internal error occurred. Please contact us if the error persists.',
		code: 'INTERNAL_ERROR',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
	});
}

function adminSameNameEmojiExistsError(): HonoApiError {
	return adminEmojiClientError('Emoji that have same name already exists.', 'SAME_NAME_EMOJI_EXISTS', '7180fe9d-1ee3-bff9-647d-fe9896d2ffb8');
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

async function publishHonoApiEmojiDeleted(
	deps: HonoApiEmojiDependencies,
	emojis: MiEmoji[],
): Promise<void> {
	if (deps.publishBroadcastStream == null) return;

	deps.publishBroadcastStream('emojiDeleted', {
		emojis: emojis.map(packHonoEmojiDetailed),
	});
}

async function publishHonoApiEmojiAdded(
	deps: HonoApiEmojiDependencies,
	emoji: MiEmoji,
): Promise<void> {
	if (deps.publishBroadcastStream == null) return;

	deps.publishBroadcastStream('emojiAdded', {
		emoji: packHonoEmojiDetailed(emoji),
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

export async function handleHonoApiAdminEmojiAdd(
	deps: HonoApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>> {
	const params = parseHonoApiParams(adminEmojiAddParamDef, body) as AdminEmojiAddParams;
	const driveFile = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (driveFile == null) throw adminAddNoSuchFileError();
	if (await emojiExistsWithLocalNameInDatabase(deps.db, params.name)) throw adminDuplicateEmojiNameError();
	if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw adminUnsupportedFileTypeError();

	const emoji = await insertEmojiInDatabase(deps.db, {
		id: genId(deps.config),
		updatedAt: new Date(),
		name: params.name,
		category: params.category ?? null,
		host: null,
		aliases: params.aliases ?? [],
		originalUrl: driveFile.url,
		publicUrl: driveFile.webpublicUrl ?? driveFile.url,
		type: driveFile.webpublicType ?? driveFile.type,
		license: params.license ?? null,
		isSensitive: params.isSensitive ?? false,
		localOnly: params.localOnly ?? false,
		roleIdsThatCanBeUsedThisEmojiAsReaction: params.roleIdsThatCanBeUsedThisEmojiAsReaction ?? [],
	});

	await refreshHonoApiLocalEmojisCache(deps);
	await publishHonoApiEmojiAdded(deps, emoji);
	await logModerationEventInDatabase(deps, me, 'addCustomEmoji', {
		emojiId: emoji.id,
		emoji,
	});

	return packHonoEmojiDetailed(emoji);
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

export async function handleHonoApiAdminEmojiDelete(
	deps: HonoApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiDeleteParamDef, body) as AdminEmojiDeleteParams;
	const emoji = await fetchEmojiByIdOrFailFromDatabase(deps.db, params.id);
	await deleteEmojiByIdFromDatabase(deps.db, emoji.id);
	await refreshHonoApiLocalEmojisCache(deps);
	await publishHonoApiEmojiDeleted(deps, [emoji]);
	await logModerationEventInDatabase(deps, me, 'deleteCustomEmoji', {
		emojiId: emoji.id,
		emoji,
	});
}

export async function handleHonoApiAdminEmojiDeleteBulk(
	deps: HonoApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiDeleteBulkParamDef, body) as AdminEmojiDeleteBulkParams;
	const emojis = await listEmojisByIdsFromDatabase(deps.db, params.ids);

	for (const emoji of emojis) {
		await deleteEmojiByIdFromDatabase(deps.db, emoji.id);
		await logModerationEventInDatabase(deps, me, 'deleteCustomEmoji', {
			emojiId: emoji.id,
			emoji,
		});
	}

	await refreshHonoApiLocalEmojisCache(deps);
	await publishHonoApiEmojiDeleted(deps, emojis);
}

export async function handleHonoApiAdminEmojiCopy(
	deps: HonoApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>> {
	const params = parseHonoApiParams(adminEmojiCopyParamDef, body) as AdminEmojiCopyParams;
	const emoji = await fetchEmojiByIdFromDatabase(deps.db, params.emojiId);
	if (emoji == null) throw adminCopyNoSuchEmojiError();

	const driveFile = await uploadSystemDriveFileFromUrl(deps, emoji.originalUrl)
		.catch(() => {
			throw adminCopyInternalError();
		});

	if (await emojiExistsWithLocalNameInDatabase(deps.db, emoji.name)) {
		throw adminDuplicateEmojiNameError();
	}

	const addedEmoji = await insertEmojiInDatabase(deps.db, {
		id: genId(deps.config),
		updatedAt: new Date(),
		originalUrl: driveFile.url,
		publicUrl: driveFile.webpublicUrl ?? driveFile.url,
		type: driveFile.webpublicType ?? driveFile.type,
		name: emoji.name,
		category: emoji.category,
		aliases: emoji.aliases,
		host: null,
		license: emoji.license,
		isSensitive: emoji.isSensitive,
		localOnly: emoji.localOnly,
		roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction,
	});

	await refreshHonoApiLocalEmojisCache(deps);
	await publishHonoApiEmojiAdded(deps, addedEmoji);
	await logModerationEventInDatabase(deps, me, 'addCustomEmoji', {
		emojiId: addedEmoji.id,
		emoji: addedEmoji,
	});

	return packHonoEmojiDetailed(addedEmoji);
}

export async function handleHonoApiAdminEmojiImportZip(
	deps: HonoApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiImportZipParamDef, body) as AdminEmojiImportZipParams;
	await deps.dbQueue.add('importCustomEmojis', {
		user: { id: me.id },
		fileId: params.fileId,
	}, {
		removeOnComplete: {
			age: 3600 * 24 * 7,
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7,
			count: 100,
		},
	});
}

export async function handleHonoApiAdminEmojiUpdate(
	deps: HonoApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminEmojiUpdateParamDef, body) as AdminEmojiUpdateParams;
	let driveFile;
	if (params.fileId) {
		driveFile = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
		if (driveFile == null) throw adminUpdateNoSuchFileError();
	}

	const emoji = params.id != null
		? await fetchEmojiByIdFromDatabase(deps.db, params.id)
		: await fetchEmojiByNameAndHostFromDatabase(deps.db, params.name!, null);
	if (emoji == null) throw adminNoSuchEmojiError();

	const doNameUpdate = params.id != null && params.name != null && params.name !== emoji.name;
	if (doNameUpdate && await emojiExistsWithLocalNameInDatabase(deps.db, params.name!)) {
		throw adminSameNameEmojiExistsError();
	}

	await updateEmojiInDatabase(deps.db, emoji.id, {
		updatedAt: new Date(),
		name: params.name,
		category: params.category,
		aliases: params.aliases,
		license: params.license,
		isSensitive: params.isSensitive,
		localOnly: params.localOnly,
		originalUrl: driveFile != null ? driveFile.url : undefined,
		publicUrl: driveFile != null ? (driveFile.webpublicUrl ?? driveFile.url) : undefined,
		type: driveFile != null ? (driveFile.webpublicType ?? driveFile.type) : undefined,
		roleIdsThatCanBeUsedThisEmojiAsReaction: params.roleIdsThatCanBeUsedThisEmojiAsReaction ?? undefined,
	});

	await refreshHonoApiLocalEmojisCache(deps);
	const updated = await fetchEmojiByIdOrFailFromDatabase(deps.db, emoji.id);

	if (doNameUpdate) {
		await publishHonoApiEmojiDeleted(deps, [emoji]);
		await publishHonoApiEmojiAdded(deps, updated);
	} else {
		await publishHonoApiEmojiUpdated(deps, [emoji.id]);
	}

	await logModerationEventInDatabase(deps, me, 'updateCustomEmoji', {
		emojiId: emoji.id,
		before: emoji,
		after: updated,
	});
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
