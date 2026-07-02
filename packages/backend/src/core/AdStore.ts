/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { ad, type AdInsert, type AdRow } from '@/db/schema/ad.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAd } from '@/models/Ad.js';

type AdUpdate = Partial<Pick<
	AdInsert,
	| 'expiresAt'
	| 'startsAt'
	| 'place'
	| 'priority'
	| 'ratio'
	| 'url'
	| 'imageUrl'
	| 'memo'
	| 'dayOfWeek'
	| 'isSensitive'
>>;

type AdOrder = ReturnType<typeof asc>;

function deserializeAd(row: AdRow): MiAd {
	return row as MiAd;
}

function adPaginationCondition(sinceId?: string | null, untilId?: string | null): SQL[] {
	if (sinceId && untilId) {
		return [
			gt(ad.id, sinceId),
			lt(ad.id, untilId),
		];
	} else if (sinceId) {
		return [gt(ad.id, sinceId)];
	} else if (untilId) {
		return [lt(ad.id, untilId)];
	} else {
		return [];
	}
}

function adPaginationOrder(sinceId?: string | null, untilId?: string | null): AdOrder {
	if (sinceId && !untilId) {
		return asc(ad.id);
	} else {
		return desc(ad.id);
	}
}

function pruneUndefinedAdUpdate(data: AdUpdate): AdUpdate {
	const set: AdUpdate = {};

	if (data.expiresAt !== undefined) set.expiresAt = data.expiresAt;
	if (data.startsAt !== undefined) set.startsAt = data.startsAt;
	if (data.place !== undefined) set.place = data.place;
	if (data.priority !== undefined) set.priority = data.priority;
	if (data.ratio !== undefined) set.ratio = data.ratio;
	if (data.url !== undefined) set.url = data.url;
	if (data.imageUrl !== undefined) set.imageUrl = data.imageUrl;
	if (data.memo !== undefined) set.memo = data.memo;
	if (data.dayOfWeek !== undefined) set.dayOfWeek = data.dayOfWeek;
	if (data.isSensitive !== undefined) set.isSensitive = data.isSensitive;

	return set;
}

export async function createAdInDatabase(
	db: MiDrizzleDatabase,
	data: AdInsert,
): Promise<MiAd> {
	const [row] = await db
		.insert(ad)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create ad');
	}

	return deserializeAd(row);
}

export async function fetchAdByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAd['id'],
): Promise<MiAd | null> {
	const [row] = await db
		.select()
		.from(ad)
		.where(eq(ad.id, id))
		.limit(1);

	return row == null ? null : deserializeAd(row);
}

export async function updateAdInDatabase(
	db: MiDrizzleDatabase,
	id: MiAd['id'],
	data: AdUpdate,
): Promise<MiAd | null> {
	const set = pruneUndefinedAdUpdate(data);

	if (Object.keys(set).length === 0) {
		return fetchAdByIdFromDatabase(db, id);
	}

	const [row] = await db
		.update(ad)
		.set(set)
		.where(eq(ad.id, id))
		.returning();

	return row == null ? null : deserializeAd(row);
}

export async function deleteAdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAd['id'],
): Promise<void> {
	await db
		.delete(ad)
		.where(eq(ad.id, id));
}

export async function listActiveAdsFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiAd[]> {
	const now = new Date();
	const dayOfWeek = 1 << now.getDay();

	const rows = await db
		.select()
		.from(ad)
		.where(and(
			gt(ad.expiresAt, now),
			lte(ad.startsAt, now),
			or(
				sql`(${ad.dayOfWeek} & ${dayOfWeek}) > 0`,
				eq(ad.dayOfWeek, 0),
			),
		));

	return rows.map(deserializeAd);
}

export async function listAdsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		sinceId?: MiAd['id'] | null;
		untilId?: MiAd['id'] | null;
		publishing?: boolean | null;
	},
): Promise<MiAd[]> {
	const now = new Date();
	const paginationConditions = adPaginationCondition(options.sinceId, options.untilId);
	let where: SQL | undefined = paginationConditions.length > 0 ? and(...paginationConditions) : undefined;

	if (options.publishing === true) {
		where = and(
			...(where == null ? [] : [where]),
			gt(ad.expiresAt, now),
			lte(ad.startsAt, now),
		);
	} else if (options.publishing === false) {
		where = or(
			and(
				...(paginationConditions.length > 0 ? paginationConditions : []),
				lte(ad.expiresAt, now),
			),
			gt(ad.startsAt, now),
		);
	}

	const rows = await db
		.select()
		.from(ad)
		.where(where)
		.orderBy(adPaginationOrder(options.sinceId, options.untilId))
		.limit(options.limit);

	return rows.map(deserializeAd);
}
