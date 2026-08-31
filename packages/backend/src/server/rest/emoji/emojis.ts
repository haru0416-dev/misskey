/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toPuny } from '@/misc/to-puny.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { FILE_TYPE_IMAGE } from '@/const.js';
import { fetchDriveFileByIdFromDatabase } from '@/core/drive/DriveFileStore.js';
import { uploadSystemDriveFileFromUrl, type DriveFileUploadDependencies } from '@/core/drive/DriveFileUploadLogic.js';
import {
	addAliasesToEmojisByIdsInDatabase,
	deleteEmojiByIdFromDatabase,
	deleteEmojisByIdsFromDatabase,
	emojiExistsWithLocalNameInDatabase,
	fetchEmojiByIdFromDatabase,
	fetchEmojiByIdOrFailFromDatabase,
	fetchEmojiByNameAndHostFromDatabase,
	fetchEmojisFromDatabase,
	insertEmojiInDatabase,
	invalidateEmojiCache,
	listEmojisByIdsOrFailFromDatabase,
	listLocalEmojisOrderedByCategoryAndNameFromDatabase,
	listLocalEmojisPageFromDatabase,
	listRemoteEmojisPageFromDatabase,
	removeAliasesFromEmojisByIdsInDatabase,
	updateEmojiInDatabase,
	updateEmojisByIdsReturningFromDatabase,
} from '@/core/emoji/EmojiStore.js';
import { logModerationEventInDatabase, logModerationEventsInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { addDbJob, type DbQueue } from '@/core/queue/queues.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { listRoleSummariesByIdsFromDatabase, type RoleSummary } from '@/core/role/RoleStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ApiBroadcastStreamPublisher } from '../events.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiEmojiDependencies = DriveFileUploadDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	dbQueue: DbQueue;
	publishBroadcastStream?: ApiBroadcastStreamPublisher;
};

export const emojiParamDef = z.object({
	name: z.string(),
});

export const adminEmojiListParamDef = z.object({
	query: z.string().nullable().default(null),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export const adminEmojiListRemoteParamDef = z.object({
	query: z.string().nullable().default(null),
	/** ローカルホストは null で表す。 */
	host: z.string().nullable().default(null),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export const adminEmojiAddParamDef = z.object({
	name: z.string().regex(/^[a-zA-Z0-9_]+$/),
	fileId: misskeyId(),
	/** null でカテゴリを解除する。 */
	category: z.string().nullable().optional(),
	aliases: z.array(z.string()).optional(),
	license: z.string().nullable().optional(),
	isSensitive: z.boolean().optional(),
	localOnly: z.boolean().optional(),
	roleIdsThatCanBeUsedThisEmojiAsReaction: z.array(z.string()).optional(),
});

/**
 * id と name の一方が有効なら、他方が不正でも許可する互換性を維持する。
 * 各値を z.unknown() として受け、superRefine 内で個別に検証する。
 */
const adminEmojiUpdateParamDef = z
	.object({
		id: z.unknown().optional(),
		name: z.unknown().optional(),
		fileId: misskeyId().optional(),
		/** null でカテゴリを解除する。 */
		category: z.string().nullable().optional(),
		aliases: z.array(z.string()).optional(),
		license: z.string().nullable().optional(),
		isSensitive: z.boolean().optional(),
		localOnly: z.boolean().optional(),
		roleIdsThatCanBeUsedThisEmojiAsReaction: z.array(z.string()).optional(),
	})
	.superRefine((data, ctx) => {
		const idValid = misskeyId().safeParse(data.id).success;
		const nameValid = z
			.string()
			.regex(/^[a-zA-Z0-9_]+$/)
			.safeParse(data.name).success;
		if (!idValid && !nameValid) {
			ctx.addIssue({
				code: 'custom',
				message: 'must match a schema in anyOf',
			});
		}
	});

// OpenAPI/misskey-js コード生成専用。上の superRefine (id/name の anyOf 判定) は
// JSON Schema 化できないため、docs 用には allOf+anyOf 構造を union+intersection で表現する。
const adminEmojiUpdateCommonFieldsDocsSchema = z.object({
	fileId: misskeyId().optional(),
	category: z.string().nullable().optional(),
	aliases: z.array(z.string()).optional(),
	license: z.string().nullable().optional(),
	isSensitive: z.boolean().optional(),
	localOnly: z.boolean().optional(),
	roleIdsThatCanBeUsedThisEmojiAsReaction: z.array(z.string()).optional(),
});
export const adminEmojiUpdateDocsParamDef = z.intersection(
	z.union([z.object({ id: misskeyId() }), z.object({ name: z.string().regex(/^[a-zA-Z0-9_]+$/) })]),
	adminEmojiUpdateCommonFieldsDocsSchema,
);

export const adminEmojiAliasesBulkParamDef = z.object({
	ids: z.array(misskeyId()),
	aliases: z.array(z.string()),
});

export const adminEmojiDeleteParamDef = z.object({
	id: misskeyId(),
});

export const adminEmojiDeleteBulkParamDef = z.object({
	ids: z.array(misskeyId()),
});

export const adminEmojiCopyParamDef = z.object({
	emojiId: misskeyId(),
});

export const adminEmojiImportZipParamDef = z.object({
	fileId: misskeyId(),
});

export const adminEmojiSetCategoryBulkParamDef = z.object({
	ids: z.array(misskeyId()),
	/** null でカテゴリを解除する。 */
	category: z.string().nullable().optional(),
});

export const adminEmojiSetLicenseBulkParamDef = z.object({
	ids: z.array(misskeyId()),
	/** null でライセンスを解除する。 */
	license: z.string().nullable().optional(),
});

type AdminEmojiListParams = z.infer<typeof adminEmojiListParamDef>;
type AdminEmojiListRemoteParams = z.infer<typeof adminEmojiListRemoteParamDef>;
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

function packEmojiSimple(emoji: MiEmoji): Packed<'EmojiSimple'> {
	return {
		aliases: emoji.aliases,
		name: emoji.name,
		category: emoji.category,
		url: emoji.publicUrl || emoji.originalUrl,
		localOnly: emoji.localOnly ? true : undefined,
		isSensitive: emoji.isSensitive ? true : undefined,
		roleIdsThatCanBeUsedThisEmojiAsReaction:
			emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0
				? emoji.roleIdsThatCanBeUsedThisEmojiAsReaction
				: undefined,
	};
}

function packEmojiDetailed(emoji: MiEmoji): Packed<'EmojiDetailed'> {
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
		sinceId = genId(params.sinceDate);
		untilId = genId(params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(params.untilDate);
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
		sinceId = genId(params.sinceDate);
		untilId = genId(params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(params.sinceDate);
	} else if (params.untilDate) {
		untilId = genId(params.untilDate);
	}

	return { sinceId, untilId };
}

function noSuchEmojiError(): ApiError {
	return new ApiError({
		status: 404,
		message: 'No such emoji.',
		code: 'NO_SUCH_EMOJI',
		id: 'e2785b66-dca3-4087-9cac-b93c541cc425',
	});
}

function adminEmojiClientError(message: string, code: string, id: string): ApiError {
	return new ApiError({
		status: 400,
		message,
		code,
		id,
	});
}

function adminNoSuchEmojiError(): ApiError {
	return adminEmojiClientError('No such emoji.', 'NO_SUCH_EMOJI', '684dec9d-a8c2-4364-9aa8-456c49cb1dc8');
}

function adminDeleteNoSuchEmojiError(): ApiError {
	return adminEmojiClientError('No such emoji.', 'NO_SUCH_EMOJI', 'be83669b-773a-44b7-b1f8-e5e5170ac3c2');
}

function adminBulkNoSuchEmojiError(): ApiError {
	return adminEmojiClientError('No such emoji.', 'NO_SUCH_EMOJI', '756e37b2-8e81-421c-9d18-740a6932d57f');
}

function adminAddNoSuchFileError(): ApiError {
	return adminEmojiClientError('No such file.', 'NO_SUCH_FILE', 'fc46b5a4-6b92-4c33-ac66-b806659bb5cf');
}

function adminUpdateNoSuchFileError(): ApiError {
	return adminEmojiClientError('No such file.', 'NO_SUCH_FILE', '14fb9fd9-0731-4e2f-aeb9-f09e4740333d');
}

function adminUnsupportedFileTypeError(): ApiError {
	return adminEmojiClientError(
		'Unsupported file type.',
		'UNSUPPORTED_FILE_TYPE',
		'f7599d96-8750-af68-1633-9575d625c1a7',
	);
}

function adminDuplicateEmojiNameError(): ApiError {
	return adminEmojiClientError('Duplicate name.', 'DUPLICATE_NAME', 'f7a3462c-4e6e-4069-8421-b9bd4f4c3975');
}

function adminCopyNoSuchEmojiError(): ApiError {
	return adminEmojiClientError('No such emoji.', 'NO_SUCH_EMOJI', 'e2785b66-dca3-4087-9cac-b93c541cc425');
}

function adminCopyInternalError(): ApiError {
	return new ApiError({
		status: 500,
		message: 'Internal error occurred. Please contact us if the error persists.',
		code: 'INTERNAL_ERROR',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
	});
}

function adminSameNameEmojiExistsError(): ApiError {
	return adminEmojiClientError(
		'Emoji that have same name already exists.',
		'SAME_NAME_EMOJI_EXISTS',
		'7180fe9d-1ee3-bff9-647d-fe9896d2ffb8',
	);
}

async function publishApiEmojiUpdated(deps: ApiEmojiDependencies, emojis: MiEmoji[]): Promise<void> {
	if (deps.publishBroadcastStream == null) return;

	deps.publishBroadcastStream('emojiUpdated', {
		emojis: emojis.map(packEmojiDetailed),
	});
}

async function finishApiEmojiBulkUpdate(deps: ApiEmojiDependencies, ids: MiEmoji['id'][]): Promise<void> {
	invalidateEmojiCache();
	const emojis = await listEmojisByIdsOrFailFromDatabase(deps.db, ids);
	await publishApiEmojiUpdated(deps, emojis);
}

function orderEmojisByRequestedIds(ids: MiEmoji['id'][], emojis: MiEmoji[]): MiEmoji[] {
	const emojiById = new Map(emojis.map((emoji) => [emoji.id, emoji]));
	return ids.map((id) => {
		const emoji = emojiById.get(id);
		if (emoji == null) throw adminBulkNoSuchEmojiError();
		return emoji;
	});
}

async function updateEmojisAtomically(
	deps: ApiEmojiDependencies,
	ids: MiEmoji['id'][],
	update: (db: MiDrizzleDatabase) => Promise<MiEmoji[]>,
): Promise<void> {
	await deps.db.transaction(async (transaction) => {
		const updated = await update(transaction as typeof deps.db);
		orderEmojisByRequestedIds(ids, updated);
	});
	await finishApiEmojiBulkUpdate(deps, ids);
}

async function publishApiEmojiDeleted(deps: ApiEmojiDependencies, emojis: MiEmoji[]): Promise<void> {
	if (deps.publishBroadcastStream == null) return;

	deps.publishBroadcastStream('emojiDeleted', {
		emojis: emojis.map(packEmojiDetailed),
	});
}

async function publishApiEmojiAdded(deps: ApiEmojiDependencies, emoji: MiEmoji): Promise<void> {
	if (deps.publishBroadcastStream == null) return;

	deps.publishBroadcastStream('emojiAdded', {
		emoji: packEmojiDetailed(emoji),
	});
}

export async function addCustomEmojiForApi(
	deps: ApiEmojiDependencies,
	data: {
		originalUrl: string;
		publicUrl: string;
		fileType: string;
		name: string;
		category: string | null;
		aliases: string[];
		host: string | null;
		license: string | null;
		isSensitive: boolean;
		localOnly: boolean;
		roleIdsThatCanBeUsedThisEmojiAsReaction: string[];
	},
	moderator?: MiLocalUser,
): Promise<MiEmoji> {
	const emoji = await insertEmojiInDatabase(deps.db, {
		id: genId(),
		updatedAt: new Date(),
		name: data.name,
		category: data.category,
		host: data.host,
		aliases: data.aliases,
		originalUrl: data.originalUrl,
		publicUrl: data.publicUrl,
		type: data.fileType,
		license: data.license,
		isSensitive: data.isSensitive,
		localOnly: data.localOnly,
		roleIdsThatCanBeUsedThisEmojiAsReaction: data.roleIdsThatCanBeUsedThisEmojiAsReaction,
	});

	if (data.host == null) {
		await publishApiEmojiAdded(deps, emoji);

		if (moderator) {
			await logModerationEventInDatabase(deps, moderator, 'addCustomEmoji', {
				emojiId: emoji.id,
				emoji,
			});
		}
	}

	return emoji;
}

export async function handleApiEmojis(deps: ApiEmojiDependencies): Promise<{
	emojis: Packed<'EmojiSimple'>[];
}> {
	const emojis = await listLocalEmojisOrderedByCategoryAndNameFromDatabase(deps.db);
	return {
		emojis: emojis.map(packEmojiSimple),
	};
}

export async function handleApiEmoji(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>> {
	const params = parseApiParams(emojiParamDef, body);
	const emoji = await fetchEmojiByNameAndHostFromDatabase(deps.db, params.name, null);
	if (emoji == null) throw noSuchEmojiError();

	return packEmojiDetailed(emoji);
}

export async function handleApiAdminEmojiList(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>[]> {
	const params = parseApiParams(adminEmojiListParamDef, body);
	const { order, sinceId, untilId } = parseLocalAdminEmojiPagination(deps.config, params);

	let emojis: MiEmoji[];
	if (params.query) {
		emojis = await listLocalEmojisPageFromDatabase(deps.db, { order, sinceId, untilId });
		const queryArray = params.query.match(/\:([a-z0-9_]*)\:/g);

		if (queryArray) {
			emojis = emojis.filter((emoji) => queryArray.includes(`:${emoji.name}:`));
		} else {
			emojis = emojis.filter(
				(emoji) =>
					emoji.name.includes(params.query!) ||
					emoji.aliases.some((alias) => alias.includes(params.query!)) ||
					emoji.category?.includes(params.query!),
			);
		}
		emojis.splice(params.limit + 1);
	} else {
		emojis = await listLocalEmojisPageFromDatabase(deps.db, { order, sinceId, untilId, limit: params.limit });
	}

	return emojis.map(packEmojiDetailed);
}

export async function handleApiAdminEmojiAdd(
	deps: ApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>> {
	const params = parseApiParams(adminEmojiAddParamDef, body);
	const driveFile = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (driveFile == null) throw adminAddNoSuchFileError();
	if (await emojiExistsWithLocalNameInDatabase(deps.db, params.name)) throw adminDuplicateEmojiNameError();
	if (!FILE_TYPE_IMAGE.includes(driveFile.type)) throw adminUnsupportedFileTypeError();

	const emoji = await insertEmojiInDatabase(deps.db, {
		id: genId(),
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

	await publishApiEmojiAdded(deps, emoji);
	await logModerationEventInDatabase(deps, me, 'addCustomEmoji', {
		emojiId: emoji.id,
		emoji,
	});

	return packEmojiDetailed(emoji);
}

export async function handleApiAdminEmojiAddAliasesBulk(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiAliasesBulkParamDef, body);
	const updatedAt = new Date();
	await updateEmojisAtomically(deps, params.ids, (db) =>
		addAliasesToEmojisByIdsInDatabase(db, params.ids, params.aliases, updatedAt),
	);
}

export async function handleApiAdminEmojiDelete(
	deps: ApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiDeleteParamDef, body);
	const emoji = await fetchEmojiByIdFromDatabase(deps.db, params.id);
	if (emoji == null) throw adminDeleteNoSuchEmojiError();
	await deleteEmojiByIdFromDatabase(deps.db, emoji.id);
	await publishApiEmojiDeleted(deps, [emoji]);
	await logModerationEventInDatabase(deps, me, 'deleteCustomEmoji', {
		emojiId: emoji.id,
		emoji,
	});
}

export async function handleApiAdminEmojiDeleteBulk(
	deps: ApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiDeleteBulkParamDef, body);
	const emojis = await deps.db.transaction(async (transaction) => {
		const db = transaction as typeof deps.db;
		const deleted = await deleteEmojisByIdsFromDatabase(db, params.ids);
		await logModerationEventsInDatabase(
			{ db },
			me,
			'deleteCustomEmoji',
			deleted.map((emoji) => ({
				emojiId: emoji.id,
				emoji,
			})),
		);
		return deleted;
	});

	invalidateEmojiCache();
	await publishApiEmojiDeleted(deps, emojis);
}

export async function handleApiAdminEmojiCopy(
	deps: ApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>> {
	const params = parseApiParams(adminEmojiCopyParamDef, body);
	const emoji = await fetchEmojiByIdFromDatabase(deps.db, params.emojiId);
	if (emoji == null) throw adminCopyNoSuchEmojiError();

	const driveFile = await uploadSystemDriveFileFromUrl(deps, emoji.originalUrl).catch(() => {
		throw adminCopyInternalError();
	});

	if (await emojiExistsWithLocalNameInDatabase(deps.db, emoji.name)) {
		throw adminDuplicateEmojiNameError();
	}

	const addedEmoji = await insertEmojiInDatabase(deps.db, {
		id: genId(),
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

	await publishApiEmojiAdded(deps, addedEmoji);
	await logModerationEventInDatabase(deps, me, 'addCustomEmoji', {
		emojiId: addedEmoji.id,
		emoji: addedEmoji,
	});

	return packEmojiDetailed(addedEmoji);
}

export async function handleApiAdminEmojiImportZip(
	deps: ApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiImportZipParamDef, body);
	await addDbJob(deps.dbQueue, {
		name: 'importCustomEmojis',
		data: { user: { id: me.id }, fileId: params.fileId },
		opts: queueRetentionOptions(deps.config),
	});
}

export async function handleApiAdminEmojiUpdate(
	deps: ApiEmojiDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiUpdateParamDef, body) as AdminEmojiUpdateParams;
	let driveFile;
	if (params.fileId) {
		driveFile = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
		if (driveFile == null) throw adminUpdateNoSuchFileError();
	}

	const emoji =
		params.id != null
			? await fetchEmojiByIdFromDatabase(deps.db, params.id)
			: await fetchEmojiByNameAndHostFromDatabase(deps.db, params.name!, null);
	if (emoji == null) throw adminNoSuchEmojiError();

	const doNameUpdate = params.id != null && params.name != null && params.name !== emoji.name;
	if (doNameUpdate && (await emojiExistsWithLocalNameInDatabase(deps.db, params.name!))) {
		throw adminSameNameEmojiExistsError();
	}

	await updateEmojiInDatabase(
		deps.db,
		emoji.id,
		omitUndefined({
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
		}),
	);

	const updated = await fetchEmojiByIdOrFailFromDatabase(deps.db, emoji.id);

	if (doNameUpdate) {
		await publishApiEmojiDeleted(deps, [emoji]);
		await publishApiEmojiAdded(deps, updated);
	} else {
		await publishApiEmojiUpdated(deps, [updated]);
	}

	await logModerationEventInDatabase(deps, me, 'updateCustomEmoji', {
		emojiId: emoji.id,
		before: emoji,
		after: updated,
	});
}

export async function handleApiAdminEmojiSetAliasesBulk(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiAliasesBulkParamDef, body);
	const updatedAt = new Date();
	await updateEmojisAtomically(deps, params.ids, (db) =>
		updateEmojisByIdsReturningFromDatabase(db, params.ids, {
			updatedAt,
			aliases: params.aliases,
		}),
	);
}

export async function handleApiAdminEmojiRemoveAliasesBulk(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiAliasesBulkParamDef, body);
	const updatedAt = new Date();
	await updateEmojisAtomically(deps, params.ids, (db) =>
		removeAliasesFromEmojisByIdsInDatabase(db, params.ids, params.aliases, updatedAt),
	);
}

export async function handleApiAdminEmojiSetCategoryBulk(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiSetCategoryBulkParamDef, body);
	const updatedAt = new Date();
	await updateEmojisAtomically(deps, params.ids, (db) =>
		updateEmojisByIdsReturningFromDatabase(db, params.ids, {
			updatedAt,
			category: params.category ?? null,
		}),
	);
}

export async function handleApiAdminEmojiSetLicenseBulk(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminEmojiSetLicenseBulkParamDef, body);
	const updatedAt = new Date();
	await updateEmojisAtomically(deps, params.ids, (db) =>
		updateEmojisByIdsReturningFromDatabase(db, params.ids, {
			updatedAt,
			license: params.license ?? null,
		}),
	);
}

export async function handleApiAdminEmojiListRemote(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'EmojiDetailed'>[]> {
	const params = parseApiParams(adminEmojiListRemoteParamDef, body);
	const { sinceId, untilId } = parseRemoteAdminEmojiPagination(deps.config, params);
	const emojis = await listRemoteEmojisPageFromDatabase(deps.db, {
		host: params.host == null ? null : toPuny(params.host),
		query: params.query,
		sinceId,
		untilId,
		limit: params.limit,
	});

	return emojis.map(packEmojiDetailed);
}

const fetchEmojisHostTypes = ['local', 'remote', 'all'] as const;
const fetchEmojisSortKeys = [
	'+id',
	'-id',
	'+updatedAt',
	'-updatedAt',
	'+name',
	'-name',
	'+host',
	'-host',
	'+uri',
	'-uri',
	'+publicUrl',
	'-publicUrl',
	'+type',
	'-type',
	'+aliases',
	'-aliases',
	'+category',
	'-category',
	'+license',
	'-license',
	'+isSensitive',
	'-isSensitive',
	'+localOnly',
	'-localOnly',
	'+roleIdsThatCanBeUsedThisEmojiAsReaction',
	'-roleIdsThatCanBeUsedThisEmojiAsReaction',
] as const;

const v2AdminEmojiListQueryParamDef = z
	.object({
		updatedAtFrom: z.string().optional(),
		updatedAtTo: z.string().optional(),
		name: z.string().optional(),
		host: z.string().optional(),
		uri: z.string().optional(),
		publicUrl: z.string().optional(),
		originalUrl: z.string().optional(),
		type: z.string().optional(),
		aliases: z.string().optional(),
		category: z.string().optional(),
		license: z.string().optional(),
		isSensitive: z.boolean().optional(),
		localOnly: z.boolean().optional(),
		hostType: z.enum(fetchEmojisHostTypes).default('all'),
		roleIds: z.array(misskeyId()).optional(),
	})
	.nullable();

const v2AdminEmojiListParamDef = z.object({
	query: v2AdminEmojiListQueryParamDef.optional(),
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
	page: z.int().optional(),
	sortKeys: z.array(z.enum(fetchEmojisSortKeys)).default(['-id']),
});

async function packEmojiDetailedAdmin(
	deps: ApiEmojiDependencies,
	emoji: MiEmoji,
	hintRoles: ReadonlyMap<RoleSummary['id'], RoleSummary>,
): Promise<Packed<'EmojiDetailedAdmin'>> {
	const roles = Array.of<RoleSummary>();
	if (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0) {
		roles.push(
			...emoji.roleIdsThatCanBeUsedThisEmojiAsReaction
				.filter((id) => hintRoles.has(id))
				.map((id) => hintRoles.get(id)!),
		);
		roles.sort((a, b) => {
			if (a.displayOrder !== b.displayOrder) return b.displayOrder - a.displayOrder;
			return a.id.localeCompare(b.id);
		});
	}

	return {
		id: emoji.id,
		updatedAt: emoji.updatedAt?.toISOString() ?? null,
		name: emoji.name,
		host: emoji.host,
		uri: emoji.uri,
		type: emoji.type,
		aliases: emoji.aliases,
		category: emoji.category,
		publicUrl: emoji.publicUrl,
		originalUrl: emoji.originalUrl,
		license: emoji.license,
		localOnly: emoji.localOnly,
		isSensitive: emoji.isSensitive,
		roleIdsThatCanBeUsedThisEmojiAsReaction: roles.map((it) => ({ id: it.id, name: it.name })),
	};
}

async function packEmojiDetailedAdminMany(
	deps: ApiEmojiDependencies,
	emojis: MiEmoji[],
): Promise<Packed<'EmojiDetailedAdmin'>[]> {
	const roleIds = [...new Set(emojis.flatMap((emoji) => emoji.roleIdsThatCanBeUsedThisEmojiAsReaction))];
	const roles = roleIds.length > 0 ? await listRoleSummariesByIdsFromDatabase(deps.db, roleIds) : [];
	const hintRoles = new Map(roles.map((role) => [role.id, role]));

	return Promise.all(emojis.map((emoji) => packEmojiDetailedAdmin(deps, emoji, hintRoles)));
}

export async function handleApiV2AdminEmojiList(
	deps: ApiEmojiDependencies,
	body: Record<string, unknown>,
): Promise<{ emojis: Packed<'EmojiDetailedAdmin'>[]; count: number; allCount: number; allPages: number }> {
	const params = parseApiParams(v2AdminEmojiListParamDef, body);

	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : undefined);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : undefined);

	const q = params.query;
	const limit = params.limit;
	const result = await fetchEmojisFromDatabase(
		deps.db,
		omitUndefined({
			query: omitUndefined({
				updatedAtFrom: q?.updatedAtFrom,
				updatedAtTo: q?.updatedAtTo,
				name: q?.name,
				host: q?.host,
				uri: q?.uri,
				publicUrl: q?.publicUrl,
				type: q?.type,
				aliases: q?.aliases,
				category: q?.category,
				license: q?.license,
				isSensitive: q?.isSensitive,
				localOnly: q?.localOnly,
				hostType: q?.hostType,
				roleIds: q?.roleIds,
			}),
			sinceId,
			untilId,
		}),
		omitUndefined({
			limit,
			page: params.page,
			sortKeys: params.sortKeys,
		}),
	);

	return {
		emojis: await packEmojiDetailedAdminMany(deps, result.emojis),
		count: result.allCount > limit ? result.emojis.length : result.allCount,
		allCount: result.allCount,
		allPages: Math.ceil(result.allCount / limit),
	};
}
