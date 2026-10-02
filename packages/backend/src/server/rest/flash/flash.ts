/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	flashLikeExistsInDatabase,
	listFlashLikesByUserIdFromDatabase,
	listLikedFlashIdsByUserIdAndFlashIdsFromDatabase,
} from '@/core/flash/flash-like-store.js';
import {
	createFlashInDatabase,
	deleteFlashFromDatabase,
	fetchFlashByIdFromDatabase,
	fetchFlashByIdOrFailFromDatabase,
	listFeaturedFlashesFromDatabase,
	listFlashesWithPaginationFromDatabase,
	updateFlashInDatabase,
} from '@/core/flash/flash-store.js';
import { logModerationEventInDatabase } from '@/core/moderation/moderation-log-logic.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser, MiLocalUser } from '@/models/User.js';
import { clientErrorWithStatus } from '../error.js';
import { userIsModerator } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { packUserLite, packUserLiteMany } from '../../../core/user/user-packing.js';
import type { UserPackingDependencies } from '../../../core/user/user-packing.js';
import { resolveApiDateIdPagination } from '../date-id-pagination.js';
import { parseApiParams } from '../validation.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type FlashDependencies = RolePolicyDependencies & UserPackingDependencies;

export const flashUpdateParamDef = z.object({
	flashId: misskeyId(),
	title: z.string().optional(),
	summary: z.string().optional(),
	script: z.string().optional(),
	permissions: z.array(z.string()).optional(),
	visibility: z.enum(['public', 'private']).optional(),
});

export async function handleApiFlashUpdate(
	deps: FlashDependencies,
	me: MiLocalUser,
	params: Params<typeof flashUpdateParamDef>,
): Promise<void> {
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
	if (params.title !== undefined) {
		values.title = params.title;
	}
	if (params.summary !== undefined) {
		values.summary = params.summary;
	}
	if (params.script !== undefined) {
		values.script = params.script;
	}
	if (params.permissions !== undefined) {
		values.permissions = params.permissions;
	}
	if (params.visibility !== undefined) {
		values.visibility = params.visibility;
	}

	await updateFlashInDatabase(deps.db, flash.id, values);
}

export async function packFlash(
	deps: FlashDependencies,
	src: MiFlash['id'] | MiFlash,
	me?: { id: MiUser['id'] } | null,
	hint?: { packedUser?: Packed<'UserLite'>; likedFlashIds?: Set<MiFlash['id']> },
): Promise<Packed<'Flash'>> {
	const meId = me ? me.id : null;
	const flash = typeof src === 'object' ? src : await fetchFlashByIdOrFailFromDatabase(deps.db, src);

	const user = hint?.packedUser ?? (await packUserLite(deps, flash.userId));

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

async function packFlashMany(
	deps: FlashDependencies,
	flashes: MiFlash[],
	me?: { id: MiUser['id'] } | null,
): Promise<Packed<'Flash'>[]> {
	if (flashes.length === 0) {
		return [];
	}

	const userIds = [...new Set(flashes.map((flash) => flash.userId))];
	const flashIds = flashes.map((flash) => flash.id);
	const [packedUsers, likedFlashIds] = await Promise.all([
		packUserLiteMany(deps, userIds),
		me ? listLikedFlashIdsByUserIdAndFlashIdsFromDatabase(deps.db, me.id, flashIds) : Promise.resolve([]),
	]);
	const userById = new Map(packedUsers.map((u) => [u.id, u]));
	const likedFlashIdSet = new Set(likedFlashIds);

	return await Promise.all(
		flashes.map((flash) =>
			packFlash(
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

export async function handleApiFlashCreate(
	deps: FlashDependencies,
	me: MiLocalUser,
	params: Params<typeof flashCreateParamDef>,
): Promise<Packed<'Flash'>> {
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

	return await packFlash(deps, flash);
}

export const flashDeleteParamDef = z.object({
	flashId: misskeyId(),
});

export async function handleApiFlashDelete(
	deps: FlashDependencies,
	me: MiLocalUser,
	params: Params<typeof flashDeleteParamDef>,
): Promise<void> {
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', 'de1623ef-bbb3-4289-a71e-14cfa83d9740');
	}

	if (!(await userIsModerator(deps, me)) && flash.userId !== me.id) {
		throw clientErrorWithStatus(400, 'Access denied.', 'ACCESS_DENIED', '1036ad7b-9f92-4fff-89c3-0e50dc941704');
	}

	await deleteFlashFromDatabase(deps.db, flash.id);

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
	offset: z.int().min(0).optional().default(0),
	limit: z.int().min(1).max(100).optional().default(10),
});

export async function handleApiFlashFeatured(
	deps: FlashDependencies,
	me: MiUser | null,
	params: Params<typeof flashFeaturedParamDef>,
): Promise<Packed<'Flash'>[]> {
	const result = await listFeaturedFlashesFromDatabase(deps.db, {
		offset: params.offset,
		limit: params.limit,
	});

	return await packFlashMany(deps, result, me);
}

export const flashMyParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiFlashMy(
	deps: FlashDependencies,
	me: MiLocalUser,
	params: Params<typeof flashMyParamDef>,
): Promise<Packed<'Flash'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const flashes = await listFlashesWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashMany(deps, flashes);
}

export const flashMyLikesParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	search: z.string().min(1).max(100).nullable().optional(),
});

export async function handleApiFlashMyLikes(
	deps: FlashDependencies,
	me: MiLocalUser,
	params: Params<typeof flashMyLikesParamDef>,
): Promise<{ id: string; flash: Packed<'Flash'> }[]> {
	const { sinceId, untilId, order } = resolveApiDateIdPagination(params);

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

	const packedFlashes = await packFlashMany(
		deps,
		likes.map((like) => like.flash),
		me,
	);
	const packedFlashById = new Map(packedFlashes.map((flash) => [flash.id, flash]));

	return await Promise.all(
		likes.map(async (like) => ({
			id: like.id,
			flash: packedFlashById.get(like.flashId) ?? (await packFlash(deps, like.flash, me)),
		})),
	);
}

export const flashSearchParamDef = z.object({
	query: z.string().min(1).max(100),
	...paginationParams,
	limit: z.int().min(1).max(100).optional().default(5),
});

export async function handleApiFlashSearch(
	deps: FlashDependencies,
	me: MiUser | null,
	params: Params<typeof flashSearchParamDef>,
): Promise<Packed<'Flash'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const result = await listFlashesWithPaginationFromDatabase(deps.db, {
		visibility: 'public',
		searchQuery: params.query,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashMany(deps, result, me);
}

export const flashShowParamDef = z.object({
	flashId: misskeyId(),
});

export async function handleApiFlashShow(
	deps: FlashDependencies,
	me: MiUser | null,
	params: Params<typeof flashShowParamDef>,
): Promise<Packed<'Flash'>> {
	const flash = await fetchFlashByIdFromDatabase(deps.db, params.flashId);
	if (flash == null) {
		throw clientErrorWithStatus(400, 'No such flash.', 'NO_SUCH_FLASH', 'f0d34a1a-d29a-401d-90ba-1982122b5630');
	}

	return await packFlash(deps, flash, me);
}

export const usersFlashsParamDef = z.object({
	userId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiUsersFlashs(
	deps: FlashDependencies,
	params: Params<typeof usersFlashsParamDef>,
): Promise<Packed<'Flash'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const flashes = await listFlashesWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		visibility: 'public',
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFlashMany(deps, flashes);
}
