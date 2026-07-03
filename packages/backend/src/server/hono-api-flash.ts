/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { flashLikeExistsInDatabase, listFlashLikesByUserIdFromDatabase, listLikedFlashIdsByUserIdFromDatabase } from '@/core/FlashLikeStore.js';
import {
	createFlashInDatabase,
	deleteFlashInDatabase,
	fetchFlashByIdFromDatabase,
	fetchFlashByIdOrFailFromDatabase,
	listFeaturedFlashsFromDatabase,
	listFlashsWithPaginationFromDatabase,
	resolveFlashPagination,
	updateFlashInDatabase,
} from '@/core/FlashStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser, MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { isHonoApiModerator, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi, type UserPackingDependencies } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiFlashDependencies = HonoApiRolePolicyDependencies & UserPackingDependencies;

const flashUpdateParamDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
		title: { type: 'string' },
		summary: { type: 'string' },
		script: { type: 'string' },
		permissions: { type: 'array', items: {
			type: 'string',
		} },
		visibility: { type: 'string', enum: ['public', 'private'] },
	},
	required: ['flashId'],
} as const;

type FlashUpdateParams = {
	flashId: string;
	title?: string;
	summary?: string;
	script?: string;
	permissions?: string[];
	visibility?: MiFlash['visibility'];
};

function clientError(status: number, message: string, code: string, id: string): HonoApiError {
	return new HonoApiError({
		status,
		message,
		code,
		id,
	});
}

export async function handleHonoApiFlashUpdate(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashUpdateParamDef, body) as FlashUpdateParams;
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientError(400, 'No such flash.', 'NO_SUCH_FLASH', '611e13d2-309e-419a-a5e4-e0422da39b02');
	}
	if (flash.userId !== me.id) {
		throw clientError(400, 'Access denied.', 'ACCESS_DENIED', '08e60c88-5948-478e-a132-02ec701d67b2');
	}

	const values: Partial<Parameters<typeof updateFlashInDatabase>[2]> = {
		updatedAt: new Date(),
	};
	if (params.title !== undefined) values.title = params.title;
	if (params.summary !== undefined) values.summary = params.summary;
	if (params.script !== undefined) values.script = params.script;
	if (params.permissions !== undefined) values.permissions = params.permissions;
	if (params.visibility !== undefined) values.visibility = params.visibility;

	await updateFlashInDatabase(deps.db, flash.id, values);
}

async function packFlashForHonoApi(
	deps: HonoApiFlashDependencies,
	src: MiFlash['id'] | MiFlash,
	me?: { id: MiUser['id'] } | null,
	hint?: { packedUser?: Packed<'UserLite'>; likedFlashIds?: MiFlash['id'][] },
): Promise<Record<string, unknown>> {
	const meId = me ? me.id : null;
	const flash = typeof src === 'object' ? src : await fetchFlashByIdOrFailFromDatabase(deps.db, src);

	const user = hint?.packedUser ?? await packUserLiteForHonoApi(deps, flash.userId);

	let isLiked: boolean | undefined;
	if (meId) {
		isLiked = hint?.likedFlashIds ? hint.likedFlashIds.includes(flash.id) : await flashLikeExistsInDatabase(deps.db, meId, flash.id);
	}

	return {
		id: flash.id,
		createdAt: parseId(deps.config, flash.id).date.toISOString(),
		updatedAt: flash.updatedAt.toISOString(),
		userId: flash.userId,
		user,
		title: flash.title,
		summary: flash.summary,
		script: flash.script,
		visibility: flash.visibility,
		likedCount: flash.likedCount,
		isLiked,
	};
}

export async function packFlashManyForHonoApi(
	deps: HonoApiFlashDependencies,
	flashes: MiFlash[],
	me?: { id: MiUser['id'] } | null,
): Promise<Record<string, unknown>[]> {
	const userIds = flashes.map(f => f.userId);
	const packedUsers = await packUserLiteManyForHonoApi(deps, userIds);
	const userById = new Map(packedUsers.map(u => [u.id, u]));
	const likedFlashIds = me ? await listLikedFlashIdsByUserIdFromDatabase(deps.db, me.id) : [];

	return await Promise.all(flashes.map(flash => packFlashForHonoApi(deps, flash, me, {
		packedUser: userById.get(flash.userId),
		likedFlashIds,
	})));
}

const flashCreateParamDef = {
	type: 'object',
	properties: {
		title: { type: 'string' },
		summary: { type: 'string' },
		script: { type: 'string' },
		permissions: { type: 'array', items: { type: 'string' } },
		visibility: { type: 'string', enum: ['public', 'private'], default: 'public' },
	},
	required: ['title', 'summary', 'script', 'permissions'],
} as const;

type FlashCreateParams = {
	title: string;
	summary: string;
	script: string;
	permissions: string[];
	visibility: MiFlash['visibility'];
};

export async function handleHonoApiFlashCreate(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const params = parseHonoApiParams(flashCreateParamDef, body) as FlashCreateParams;
	const flash = await createFlashInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		updatedAt: new Date(),
		title: params.title,
		summary: params.summary,
		script: params.script,
		permissions: params.permissions,
		visibility: params.visibility,
	});

	return await packFlashForHonoApi(deps, flash);
}

const flashDeleteParamDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
	},
	required: ['flashId'],
} as const;

type FlashDeleteParams = {
	flashId: string;
};

export async function handleHonoApiFlashDelete(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashDeleteParamDef, body) as FlashDeleteParams;
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientError(400, 'No such flash.', 'NO_SUCH_FLASH', 'de1623ef-bbb3-4289-a71e-14cfa83d9740');
	}

	if (!await isHonoApiModerator(deps, me) && flash.userId !== me.id) {
		throw clientError(400, 'Access denied.', 'ACCESS_DENIED', '1036ad7b-9f92-4fff-89c3-0e50dc941704');
	}

	await deleteFlashInDatabase(deps.db, flash.id);

	if (flash.userId !== me.id) {
		const user = await fetchUserByIdOrFailFromDatabase(deps.db, flash.userId);
		await logModerationEventInDatabase(deps, me, 'deleteFlash', {
			flashId: flash.id,
			flashUserId: flash.userId,
			flashUserUsername: user.username,
			flash,
		});
	}
}

const flashFeaturedParamDef = {
	type: 'object',
	properties: {
		offset: { type: 'integer', minimum: 0, default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: [],
} as const;

type FlashFeaturedParams = {
	offset: number;
	limit: number;
};

export async function handleHonoApiFlashFeatured(
	deps: HonoApiFlashDependencies,
	me: MiUser | null,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(flashFeaturedParamDef, body) as FlashFeaturedParams;
	const result = await listFeaturedFlashsFromDatabase(deps.db, {
		offset: params.offset,
		limit: params.limit,
	});

	return await packFlashManyForHonoApi(deps, result, me);
}

const flashMyParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type FlashMyParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiFlashMy(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(flashMyParamDef, body) as FlashMyParams;
	const pagination = resolveFlashPagination({ gen: time => genId(deps.config, time) }, params);
	const flashes = await listFlashsWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashManyForHonoApi(deps, flashes);
}

const flashMyLikesParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		search: { type: 'string', minLength: 1, maxLength: 100, nullable: true },
	},
	required: [],
} as const;

type FlashMyLikesParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	search?: string | null;
};

export async function handleHonoApiFlashMyLikes(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(flashMyLikesParamDef, body) as FlashMyLikesParams;

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
		sinceId = genId(deps.config, params.sinceDate);
		untilId = genId(deps.config, params.untilDate);
	} else if (params.sinceDate) {
		sinceId = genId(deps.config, params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(deps.config, params.untilDate);
	}

	const likes = await listFlashLikesByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
		search: params.search,
	});

	return await Promise.all(likes.map(async like => ({
		id: like.id,
		flash: await packFlashForHonoApi(deps, like.flash, me),
	})));
}

const flashSearchParamDef = {
	type: 'object',
	properties: {
		query: { type: 'string', minLength: 1, maxLength: 100 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
	},
	required: ['query'],
} as const;

type FlashSearchParams = {
	query: string;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
};

export async function handleHonoApiFlashSearch(
	deps: HonoApiFlashDependencies,
	me: MiUser | null,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(flashSearchParamDef, body) as FlashSearchParams;
	const pagination = resolveFlashPagination({ gen: time => genId(deps.config, time) }, params);
	const result = await listFlashsWithPaginationFromDatabase(deps.db, {
		visibility: 'public',
		searchQuery: params.query,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashManyForHonoApi(deps, result, me);
}

const flashShowParamDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
	},
	required: ['flashId'],
} as const;

type FlashShowParams = {
	flashId: string;
};

export async function handleHonoApiFlashShow(
	deps: HonoApiFlashDependencies,
	me: MiUser | null,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const params = parseHonoApiParams(flashShowParamDef, body) as FlashShowParams;
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientError(400, 'No such flash.', 'NO_SUCH_FLASH', 'f0d34a1a-d29a-401d-90ba-1982122b5630');
	}

	return await packFlashForHonoApi(deps, flash, me);
}

const usersFlashsParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['userId'],
} as const;

type UsersFlashsParams = {
	userId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiUsersFlashs(
	deps: HonoApiFlashDependencies,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(usersFlashsParamDef, body) as UsersFlashsParams;
	const pagination = resolveFlashPagination({ gen: time => genId(deps.config, time) }, params);
	const flashes = await listFlashsWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		visibility: 'public',
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashManyForHonoApi(deps, flashes);
}
