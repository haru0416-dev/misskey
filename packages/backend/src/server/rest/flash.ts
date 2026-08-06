/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	flashLikeExistsInDatabase,
	listFlashLikesByUserIdFromDatabase,
	listLikedFlashIdsByUserIdAndFlashIdsFromDatabase,
} from '@/core/FlashLikeStore.js';
import {
	createFlashInDatabase,
	deleteFlashInDatabase,
	fetchFlashByIdFromDatabase,
	fetchFlashByIdOrFailFromDatabase,
	listFeaturedFlashesFromDatabase,
	listFlashesWithPaginationFromDatabase,
	resolveFlashPagination,
	updateFlashInDatabase,
} from '@/core/FlashStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser, MiLocalUser } from '@/models/User.js';
import { clientErrorWithStatus } from './error.js';
import { isHonoApiModerator, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiFlashDependencies = HonoApiRolePolicyDependencies & UserPackingDependencies;

export const flashUpdateParamDef = z.object({
	flashId: misskeyId(),
	title: z.string().optional(),
	summary: z.string().optional(),
	script: z.string().optional(),
	permissions: z.array(z.string()).optional(),
	visibility: z.enum(['public', 'private']).optional(),
});

type FlashUpdateParams = {
	flashId: string;
	title?: string;
	summary?: string;
	script?: string;
	permissions?: string[];
	visibility?: MiFlash['visibility'];
};

export async function handleHonoApiFlashUpdate(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashUpdateParamDef, body);
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', '611e13d2-309e-419a-a5e4-e0422da39b02');
	}
	if (flash.userId !== me.id) {
		throw clientErrorWithStatus(400, 'Access denied.', 'ACCESS_DENIED', '08e60c88-5948-478e-a132-02ec701d67b2');
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

export async function packFlashForHonoApi(
	deps: HonoApiFlashDependencies,
	src: MiFlash['id'] | MiFlash,
	me?: { id: MiUser['id'] } | null,
	hint?: { packedUser?: Packed<'UserLite'>; likedFlashIds?: Set<MiFlash['id']> },
): Promise<Record<string, unknown>> {
	const meId = me ? me.id : null;
	const flash = typeof src === 'object' ? src : await fetchFlashByIdOrFailFromDatabase(deps.db, src);

	const user = hint?.packedUser ?? (await packUserLiteForHonoApi(deps, flash.userId));

	let isLiked: boolean | undefined;
	if (meId) {
		isLiked = hint?.likedFlashIds
			? hint.likedFlashIds.has(flash.id)
			: await flashLikeExistsInDatabase(deps.db, meId, flash.id);
	}

	return {
		id: flash.id,
		createdAt: parseId(flash.id).date.toISOString(),
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
	if (flashes.length === 0) return [];

	const userIds = [...new Set(flashes.map((flash) => flash.userId))];
	const flashIds = flashes.map((flash) => flash.id);
	const [packedUsers, likedFlashIds] = await Promise.all([
		packUserLiteManyForHonoApi(deps, userIds),
		me ? listLikedFlashIdsByUserIdAndFlashIdsFromDatabase(deps.db, me.id, flashIds) : Promise.resolve([]),
	]);
	const userById = new Map(packedUsers.map((u) => [u.id, u]));
	const likedFlashIdSet = new Set(likedFlashIds);

	return await Promise.all(
		flashes.map((flash) =>
			packFlashForHonoApi(
				deps,
				flash,
				me,
				omitUndefined({
					packedUser: userById.get(flash.userId),
					likedFlashIds: likedFlashIdSet,
				}),
			),
		),
	);
}

export const flashCreateParamDef = z.object({
	title: z.string(),
	summary: z.string(),
	script: z.string(),
	permissions: z.array(z.string()),
	visibility: z.enum(['public', 'private']).optional().default('public'),
});

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
	const params = parseHonoApiParams(flashCreateParamDef, body);
	const flash = await createFlashInDatabase(deps.db, {
		id: genId(),
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

export const flashDeleteParamDef = z.object({
	flashId: misskeyId(),
});

type FlashDeleteParams = {
	flashId: string;
};

export async function handleHonoApiFlashDelete(
	deps: HonoApiFlashDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(flashDeleteParamDef, body);
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', 'de1623ef-bbb3-4289-a71e-14cfa83d9740');
	}

	if (!(await isHonoApiModerator(deps, me)) && flash.userId !== me.id) {
		throw clientErrorWithStatus(400, 'Access denied.', 'ACCESS_DENIED', '1036ad7b-9f92-4fff-89c3-0e50dc941704');
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

export const flashFeaturedParamDef = z.object({
	offset: z.number().int().min(0).optional().default(0),
	limit: z.number().int().min(1).max(100).optional().default(10),
});

type FlashFeaturedParams = {
	offset: number;
	limit: number;
};

export async function handleHonoApiFlashFeatured(
	deps: HonoApiFlashDependencies,
	me: MiUser | null,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(flashFeaturedParamDef, body);
	const result = await listFeaturedFlashesFromDatabase(deps.db, {
		offset: params.offset,
		limit: params.limit,
	});

	return await packFlashManyForHonoApi(deps, result, me);
}

export const flashMyParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

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
	const params = parseHonoApiParams(flashMyParamDef, body);
	const pagination = resolveFlashPagination({ gen: (time) => genId(time) }, params);
	const flashes = await listFlashesWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashManyForHonoApi(deps, flashes);
}

export const flashMyLikesParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	search: z.string().min(1).max(100).nullable().optional(),
});

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
	const params = parseHonoApiParams(flashMyLikesParamDef, body);

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

	const likes = await listFlashLikesByUserIdFromDatabase(
		deps.db,
		me.id,
		omitUndefined({
			limit: params.limit,
			order,
			sinceId,
			untilId,
			search: params.search,
		}),
	);

	const packedFlashes = await packFlashManyForHonoApi(
		deps,
		likes.map((like) => like.flash),
		me,
	);
	const packedFlashById = new Map(packedFlashes.map((flash) => [flash['id'], flash]));

	return await Promise.all(
		likes.map(async (like) => ({
			id: like.id,
			flash: packedFlashById.get(like.flashId) ?? (await packFlashForHonoApi(deps, like.flash, me)),
		})),
	);
}

export const flashSearchParamDef = z.object({
	query: z.string().min(1).max(100),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).optional().default(5),
});

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
	const params = parseHonoApiParams(flashSearchParamDef, body);
	const pagination = resolveFlashPagination({ gen: (time) => genId(time) }, params);
	const result = await listFlashesWithPaginationFromDatabase(deps.db, {
		visibility: 'public',
		searchQuery: params.query,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashManyForHonoApi(deps, result, me);
}

export const flashShowParamDef = z.object({
	flashId: misskeyId(),
});

type FlashShowParams = {
	flashId: string;
};

export async function handleHonoApiFlashShow(
	deps: HonoApiFlashDependencies,
	me: MiUser | null,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const params = parseHonoApiParams(flashShowParamDef, body);
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', 'f0d34a1a-d29a-401d-90ba-1982122b5630');
	}

	return await packFlashForHonoApi(deps, flash, me);
}

export const usersFlashsParamDef = z.object({
	userId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

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
	const params = parseHonoApiParams(usersFlashsParamDef, body);
	const pagination = resolveFlashPagination({ gen: (time) => genId(time) }, params);
	const flashes = await listFlashesWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		visibility: 'public',
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashManyForHonoApi(deps, flashes);
}
