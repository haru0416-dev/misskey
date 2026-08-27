/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	createAdInDatabase,
	deleteAdFromDatabase,
	fetchAdByIdFromDatabase,
	listAdsFromDatabase,
	updateAdInDatabase,
} from '@/core/ad/AdStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { omitUndefined } from '@/misc/clone.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiAd } from '@/models/Ad.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminAdDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export const adminAdCreateParamDef = z.object({
	url: z.string().min(1),
	memo: z.string(),
	place: z.string(),
	priority: z.string(),
	ratio: z.int(),
	expiresAt: z.int(),
	startsAt: z.int(),
	imageUrl: z.string().min(1),
	dayOfWeek: z.int(),
	isSensitive: z.boolean().optional(),
});

export const adminAdDeleteParamDef = z.object({
	id: misskeyId(),
});

export const adminAdListParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	publishing: z.boolean().nullable().default(null),
});

export const adminAdUpdateParamDef = z.object({
	id: misskeyId(),
	memo: z.string().optional(),
	url: z.string().min(1).optional(),
	imageUrl: z.string().min(1).optional(),
	place: z.string().optional(),
	priority: z.string().optional(),
	ratio: z.int().optional(),
	expiresAt: z.int().optional(),
	startsAt: z.int().optional(),
	dayOfWeek: z.int().optional(),
	isSensitive: z.boolean().optional(),
});

function noSuchAdError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such ad.',
		code: 'NO_SUCH_AD',
		id,
	});
}

function packAdForApi(ad: MiAd): Packed<'Ad'> {
	return {
		id: ad.id,
		expiresAt: ad.expiresAt.toISOString(),
		startsAt: ad.startsAt.toISOString(),
		dayOfWeek: ad.dayOfWeek,
		isSensitive: ad.isSensitive,
		url: ad.url,
		imageUrl: ad.imageUrl,
		priority: ad.priority,
		ratio: ad.ratio,
		place: ad.place,
		memo: ad.memo,
	};
}

export async function handleApiAdminAdCreate(
	deps: ApiAdminAdDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Ad'>> {
	const params = parseApiParams(adminAdCreateParamDef, body);
	const ad = await createAdInDatabase(deps.db, {
		id: genId(),
		expiresAt: new Date(params.expiresAt),
		startsAt: new Date(params.startsAt),
		dayOfWeek: params.dayOfWeek,
		isSensitive: params.isSensitive ?? false,
		url: params.url,
		imageUrl: params.imageUrl,
		priority: params.priority,
		ratio: params.ratio,
		place: params.place,
		memo: params.memo,
	});

	void logModerationEventInDatabase(deps, me, 'createAd', {
		adId: ad.id,
		ad,
	});

	return packAdForApi(ad);
}

export async function handleApiAdminAdDelete(
	deps: ApiAdminAdDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAdDeleteParamDef, body);
	const ad = await fetchAdByIdFromDatabase(deps.db, params.id);

	if (ad == null) throw noSuchAdError('ccac9863-3a03-416e-b899-8a64041118b1');

	await deleteAdFromDatabase(deps.db, ad.id);

	void logModerationEventInDatabase(deps, me, 'deleteAd', {
		adId: ad.id,
		ad,
	});
}

export async function handleApiAdminAdList(
	deps: ApiAdminAdDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Ad'>[]> {
	const params = parseApiParams(adminAdListParamDef, body);
	const { sinceId, untilId } = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const ads = await listAdsFromDatabase(deps.db, {
		limit: params.limit,
		sinceId,
		untilId,
		publishing: params.publishing,
	});

	return ads.map(packAdForApi);
}

export async function handleApiAdminAdUpdate(
	deps: ApiAdminAdDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAdUpdateParamDef, body);
	const ad = await fetchAdByIdFromDatabase(deps.db, params.id);

	if (ad == null) throw noSuchAdError('b7aa1727-1354-47bc-a182-3a9c3973d300');

	const updatedAd = await updateAdInDatabase(
		deps.db,
		ad.id,
		omitUndefined({
			url: params.url,
			place: params.place,
			priority: params.priority,
			ratio: params.ratio,
			memo: params.memo,
			imageUrl: params.imageUrl,
			expiresAt: params.expiresAt ? new Date(params.expiresAt) : undefined,
			startsAt: params.startsAt ? new Date(params.startsAt) : undefined,
			dayOfWeek: params.dayOfWeek,
			isSensitive: params.isSensitive,
		}),
	);

	if (updatedAd == null) throw noSuchAdError('b7aa1727-1354-47bc-a182-3a9c3973d300');

	void logModerationEventInDatabase(deps, me, 'updateAd', {
		adId: ad.id,
		before: ad,
		after: updatedAd,
	});
}
