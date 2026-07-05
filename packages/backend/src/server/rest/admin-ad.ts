/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import {
	createAdInDatabase,
	deleteAdFromDatabase,
	fetchAdByIdFromDatabase,
	listAdsFromDatabase,
	updateAdInDatabase,
} from '@/core/AdStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiAd } from '@/models/Ad.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { resolveHonoApiIdPagination } from './following.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminAdDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

const adminAdCreateParamDef = {
	type: 'object',
	properties: {
		url: { type: 'string', minLength: 1 },
		memo: { type: 'string' },
		place: { type: 'string' },
		priority: { type: 'string' },
		ratio: { type: 'integer' },
		expiresAt: { type: 'integer' },
		startsAt: { type: 'integer' },
		imageUrl: { type: 'string', minLength: 1 },
		dayOfWeek: { type: 'integer' },
		isSensitive: { type: 'boolean' },
	},
	required: ['url', 'memo', 'place', 'priority', 'ratio', 'expiresAt', 'startsAt', 'imageUrl', 'dayOfWeek'],
} as const;

const adminAdDeleteParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['id'],
} as const;

const adminAdListParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		publishing: { type: 'boolean', default: null, nullable: true },
	},
	required: [],
} as const;

const adminAdUpdateParamDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		memo: { type: 'string' },
		url: { type: 'string', minLength: 1 },
		imageUrl: { type: 'string', minLength: 1 },
		place: { type: 'string' },
		priority: { type: 'string' },
		ratio: { type: 'integer' },
		expiresAt: { type: 'integer' },
		startsAt: { type: 'integer' },
		dayOfWeek: { type: 'integer' },
		isSensitive: { type: 'boolean' },
	},
	required: ['id'],
} as const;

type AdminAdCreateParams = SchemaType<typeof adminAdCreateParamDef>;
type AdminAdDeleteParams = SchemaType<typeof adminAdDeleteParamDef>;
type AdminAdListParams = SchemaType<typeof adminAdListParamDef>;
type AdminAdUpdateParams = SchemaType<typeof adminAdUpdateParamDef>;

function noSuchAdError(id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such ad.',
		code: 'NO_SUCH_AD',
		id,
	});
}

function packAdForHonoApi(ad: MiAd): Packed<'Ad'> {
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

export async function handleHonoApiAdminAdCreate(
	deps: HonoApiAdminAdDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Ad'>> {
	const params = parseHonoApiParams(adminAdCreateParamDef, body) as AdminAdCreateParams;
	const ad = await createAdInDatabase(deps.db, {
		id: genId(deps.config),
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

	return packAdForHonoApi(ad);
}

export async function handleHonoApiAdminAdDelete(
	deps: HonoApiAdminAdDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAdDeleteParamDef, body) as AdminAdDeleteParams;
	const ad = await fetchAdByIdFromDatabase(deps.db, params.id);

	if (ad == null) throw noSuchAdError('ccac9863-3a03-416e-b899-8a64041118b1');

	await deleteAdFromDatabase(deps.db, ad.id);

	void logModerationEventInDatabase(deps, me, 'deleteAd', {
		adId: ad.id,
		ad,
	});
}

export async function handleHonoApiAdminAdList(
	deps: HonoApiAdminAdDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Ad'>[]> {
	const params = parseHonoApiParams(adminAdListParamDef, body) as AdminAdListParams;
	const { sinceId, untilId } = resolveHonoApiIdPagination(deps.config, params);
	const ads = await listAdsFromDatabase(deps.db, {
		limit: params.limit,
		sinceId,
		untilId,
		publishing: params.publishing,
	});

	return ads.map(packAdForHonoApi);
}

export async function handleHonoApiAdminAdUpdate(
	deps: HonoApiAdminAdDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminAdUpdateParamDef, body) as AdminAdUpdateParams;
	const ad = await fetchAdByIdFromDatabase(deps.db, params.id);

	if (ad == null) throw noSuchAdError('b7aa1727-1354-47bc-a182-3a9c3973d300');

	const updatedAd = await updateAdInDatabase(deps.db, ad.id, {
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
	});

	if (updatedAd == null) throw noSuchAdError('b7aa1727-1354-47bc-a182-3a9c3973d300');

	void logModerationEventInDatabase(deps, me, 'updateAd', {
		adId: ad.id,
		before: ad,
		after: updatedAd,
	});
}
